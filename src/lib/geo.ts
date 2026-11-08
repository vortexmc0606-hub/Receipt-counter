/**
 * Smart location and sales-tax estimation.
 *
 * A receipt usually prints no tax rate, so the app has to guess one. Where the
 * receipt was bought decides which guesses are plausible: a purchase in Oregon
 * has no sales tax at all, one in California is near 7.25% plus a local add-on.
 * This module turns the browser's coarse location into a likely rate, and reads
 * any address printed on the receipt as a fallback when geolocation is denied.
 *
 * Everything here is best-effort and offline: it never sends the location
 * anywhere, and the guessed rate is always shown to the user as an estimate.
 */

/** A coarse location, resolved from the browser or from the receipt text. */
export interface GeoLocation {
  country: string;
  /** Two-letter state/province code, when known (e.g. "CA", "ON"). */
  region?: string;
  /** Lower-cased place name (city or town), when known. */
  place?: string;
  lat?: number;
  lon?: number;
  /** Where the location came from, for showing the user. */
  source: 'gps' | 'receipt' | 'manual';
}

export interface TaxEstimate {
  /** Combined state + local rate in percent. */
  rate: number;
  /** Human label, e.g. "California (approx. 7.25%–10.25%)". */
  label: string;
  /** The region the estimate is based on, when known. */
  region?: string;
  /** True when the estimate came from a whole-country default. */
  rough: boolean;
}

/** US states with no statewide sales tax. */
const NO_TAX_STATES = new Set(['AK', 'DE', 'MT', 'NH', 'OR']);

/**
 * Approximate combined state + average local sales-tax rate by US state, in
 * percent. These are the widely published average combined rates; the actual
 * rate depends on the city and county, so they are labelled as estimates.
 */
const US_STATE_RATES: Record<string, number> = {
  AL: 9.24, AK: 1.76, AZ: 8.4, AR: 9.47, CA: 8.85, CO: 7.81, CT: 6.35, DE: 0,
  DC: 6.0, FL: 7.01, GA: 7.35, HI: 4.5, ID: 6.03, IL: 8.86, IN: 7.0, IA: 6.94,
  KS: 8.7, KY: 6.0, LA: 9.55, ME: 5.5, MD: 6.0, MA: 6.25, MI: 6.0, MN: 7.49,
  MS: 7.07, MO: 8.31, MT: 0, NE: 6.94, NV: 8.24, NH: 0, NJ: 6.6, NM: 7.83,
  NY: 8.53, NC: 6.98, ND: 6.96, OH: 7.24, OK: 8.98, OR: 0, PA: 6.34, RI: 7.0,
  SC: 7.44, SD: 6.11, TN: 9.55, TX: 8.2, UT: 7.19, VT: 6.24, VA: 5.77, WA: 9.29,
  WV: 6.55, WI: 5.43, WY: 5.44,
};

/** State/province code -> full name, for labels and matching. */
const REGION_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'Washington, D.C.',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', ON: 'Ontario',
  PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan', NT: 'Northwest Territories',
  NU: 'Nunavut', YT: 'Yukon',
};

/** Full state name -> code, so an address line "Sacramento, CA" is understood. */
const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(REGION_NAMES).map(([code, name]) => [name.toLowerCase(), code]),
);

/**
 * Country -> typical VAT/GST rate in percent, used outside the US. Countries
 * that vary a lot by state (India, Canada) are left out; those fall back to a
 * country-wide default only when nothing finer is known.
 */
const COUNTRY_RATES: Record<string, { rate: number; label: string }> = {
  GB: { rate: 20, label: 'United Kingdom (VAT 20%)' },
  IE: { rate: 23, label: 'Ireland (VAT 23%)' },
  DE: { rate: 19, label: 'Germany (VAT 19%)' },
  FR: { rate: 20, label: 'France (VAT 20%)' },
  ES: { rate: 21, label: 'Spain (VAT 21%)' },
  IT: { rate: 22, label: 'Italy (VAT 22%)' },
  NL: { rate: 21, label: 'Netherlands (VAT 21%)' },
  BE: { rate: 21, label: 'Belgium (VAT 21%)' },
  AT: { rate: 20, label: 'Austria (VAT 20%)' },
  PT: { rate: 23, label: 'Portugal (VAT 23%)' },
  SE: { rate: 25, label: 'Sweden (VAT 25%)' },
  DK: { rate: 25, label: 'Denmark (VAT 25%)' },
  FI: { rate: 24, label: 'Finland (VAT 24%)' },
  NO: { rate: 25, label: 'Norway (VAT 25%)' },
  PL: { rate: 23, label: 'Poland (VAT 23%)' },
  GR: { rate: 24, label: 'Greece (VAT 24%)' },
  CH: { rate: 8.1, label: 'Switzerland (VAT 8.1%)' },
  AU: { rate: 10, label: 'Australia (GST 10%)' },
  NZ: { rate: 15, label: 'New Zealand (GST 15%)' },
  SG: { rate: 9, label: 'Singapore (GST 9%)' },
  JP: { rate: 10, label: 'Japan (consumption tax 10%)' },
  AE: { rate: 5, label: 'United Arab Emirates (VAT 5%)' },
  ZA: { rate: 15, label: 'South Africa (VAT 15%)' },
  IN: { rate: 18, label: 'India (GST 18% typical)' },
  CA: { rate: 13, label: 'Canada (GST/HST 5%–15%)' },
};

/** Round to two decimals. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The best tax estimate for a resolved location, or null when unknown. */
export function estimateTax(loc: GeoLocation): TaxEstimate | null {
  const country = (loc.country || '').toUpperCase();
  const region = (loc.region || '').toUpperCase();

  if (country === 'US' || country === 'USA' || country === 'UNITED STATES') {
    if (region && US_STATE_RATES[region] !== undefined) {
      const rate = US_STATE_RATES[region];
      const name = REGION_NAMES[region] ?? region;
      if (NO_TAX_STATES.has(region)) {
        return { rate: 0, label: `${name} has no state sales tax`, region, rough: false };
      }
      return { rate, label: `${name} (approx. ${rate}% combined)`, region, rough: false };
    }
    return { rate: 0, label: 'United States (state unknown)', rough: true };
  }

  if (region && COUNTRY_RATES[country]) {
    return { ...COUNTRY_RATES[country], region, rough: false };
  }
  if (COUNTRY_RATES[country]) {
    return { ...COUNTRY_RATES[country], rough: false };
  }
  return null;
}

/** A short label for a location, e.g. "Sacramento, CA, US". */
export function describeLocation(loc: GeoLocation): string {
  const parts = [loc.place, loc.region && (REGION_NAMES[loc.region.toUpperCase()] ?? loc.region), loc.country];
  return parts.filter(Boolean).join(', ');
}

/**
 * Reads a US state/province or country out of receipt text. Receipts print a
 * city/state/zip line under the store name ("SACRAMENTO, CA 95814"), which is a
 * reliable location signal when the browser will not share one.
 */
export function locationFromText(text: string): GeoLocation | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  // City, ST ZIP  — the classic US address tail.
  for (const line of lines) {
    const m = line.match(/\b([A-Za-z .'-]{3,}),?\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/);
    if (m) {
      const code = m[2].toUpperCase();
      if (US_STATE_RATES[code] !== undefined) {
        return { country: 'US', region: code, place: m[1].trim(), source: 'receipt' };
      }
    }
  }

  // A bare "CA" / "ON" token beside a city name, or a full state name.
  for (const line of lines) {
    const full = line.match(new RegExp(`\\b(${Object.keys(NAME_TO_CODE).join('|')})\\b`, 'i'));
    if (full) {
      const code = NAME_TO_CODE[full[1].toLowerCase()];
      return { country: code === 'CA' ? 'CA' : 'US', region: code, source: 'receipt' };
    }
    const short = line.match(/\b([A-Z]{2})\b/);
    if (short && US_STATE_RATES[short[1]] !== undefined && /[a-z]/i.test(line)) {
      return { country: 'US', region: short[1], source: 'receipt' };
    }
  }

  // Country hints.
  if (/\b(united kingdom|uk|england|scotland|wales)\b/i.test(text)) return { country: 'GB', source: 'receipt' };
  if (/\bcanada\b/i.test(text)) return { country: 'CA', source: 'receipt' };
  if (/\baustralia\b/i.test(text)) return { country: 'AU', source: 'receipt' };
  if (/\bindia\b/i.test(text)) return { country: 'IN', source: 'receipt' };
  return null;
}

/** Asks the browser for a coarse location (city-level). Resolves null on refusal. */
export function browserLocation(timeoutMs = 8000): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let done = false;
    const finish = (v: { lat: number; lon: number } | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        finish({ lat: round2(pos.coords.latitude), lon: round2(pos.coords.longitude) });
      },
      () => {
        clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60 * 1000 },
    );
  });
}

/**
 * Turns latitude/longitude into a country and state. Uses a tiny built-in box
 * table so the lookup is offline and needs no API key; a point outside every box
 * returns null and the caller falls back to the receipt text.
 */
export function locateFromCoords(lat: number, lon: number): GeoLocation | null {
  // Rough bounding boxes: [minLat, maxLat, minLon, maxLon, country, region].
  const boxes: [number, number, number, number, string, string][] = [
    [32.5, 42.0, -124.5, -114.1, 'US', 'CA'],
    [41.9, 49.0, -124.8, -116.9, 'US', 'OR'],
    [45.5, 49.0, -124.8, -116.9, 'US', 'WA'],
    [31.3, 37.0, -114.8, -109.0, 'US', 'AZ'],
    [37.0, 42.0, -120.0, -114.0, 'US', 'NV'],
    [37.0, 41.0, -109.1, -102.0, 'US', 'CO'],
    [25.8, 36.5, -106.7, -93.5, 'US', 'TX'],
    [24.4, 31.0, -106.6, -80.0, 'US', 'FL'],
    [40.5, 45.0, -79.8, -71.8, 'US', 'NY'],
    [38.9, 42.8, -91.6, -87.0, 'US', 'IL'],
    [43.0, 49.0, -97.3, -89.5, 'US', 'MN'],
    [49.0, 60.0, -141.0, -52.0, 'CA', 'BC'],
    [41.6, 57.0, -95.2, -74.3, 'CA', 'ON'],
    [45.0, 62.0, -79.8, -57.1, 'CA', 'QC'],
    [49.9, 61.0, -8.7, 2.0, 'GB', ''],
    [-44.0, -10.0, 112.9, 154.0, 'AU', ''],
    [8.0, 37.1, 68.1, 97.4, 'IN', ''],
  ];
  for (const [minLat, maxLat, minLon, maxLon, country, region] of boxes) {
    if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
      return { country, region: region || undefined, lat, lon, source: 'gps' };
    }
  }
  return { country: '', lat, lon, source: 'gps' };
}

/** Resolves a location from the browser, falling back to the receipt text. */
export async function detectLocation(receiptText?: string): Promise<GeoLocation | null> {
  const coords = await browserLocation();
  if (coords) {
    const loc = locateFromCoords(coords.lat, coords.lon);
    if (loc && loc.country) return loc;
  }
  if (receiptText) return locationFromText(receiptText);
  return null;
}
