import { Award, Heart, ReceiptText, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { BRAND } from '../lib/brand';

/** The About / credits page: who made the app and what it is built on. */
export function Credits() {
  const stack = [
    ['React + TypeScript', 'The interface'],
    ['Vite', 'Build tooling'],
    ['tesseract.js', 'On-device OCR'],
    ['IndexedDB (idb)', 'Local, private storage'],
    ['Recharts', 'Charts and trends'],
    ['lucide-react', 'Icons'],
    ['date-fns', 'Date handling'],
    ['Custom CV pipeline', 'Document detection, perspective correction and de-skew'],
  ];

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 880 }}>
      <div className="card card-pad" style={{ position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, transparent), transparent 60%)',
            pointerEvents: 'none',
          }}
        />
        <div className="row" style={{ gap: 16, alignItems: 'center', position: 'relative' }}>
          <span
            className="brand-badge"
            style={{ width: 58, height: 58, borderRadius: 18, display: 'grid', placeItems: 'center' }}
          >
            <ReceiptText size={30} />
          </span>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, letterSpacing: '-0.02em' }}>{BRAND.product}</h1>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 14.5 }}>
              {BRAND.tagline} — scan a receipt, get every item and price in date order, and ask{' '}
              <strong>{BRAND.assistant}</strong> to find anything in it.
            </p>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="section-title">
          <Award size={16} /> Made by
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
          {BRAND.maker}
        </p>
        <p className="muted tiny" style={{ marginTop: 6 }}>
          Design, product and engineering.
        </p>
        <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <span className="btn btn-sm" style={{ pointerEvents: 'none' }}>
            <Heart size={14} /> Made with care
          </span>
          <span className="btn btn-sm" style={{ pointerEvents: 'none' }}>
            <Sparkles size={14} /> {BRAND.assistant}, the receipt assistant
          </span>
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="section-title">
          <Zap size={16} /> Built with
        </h3>
        <div className="grid" style={{ gap: 10, marginTop: 6 }}>
          {stack.map(([name, what]) => (
            <div className="row" key={name} style={{ justifyContent: 'space-between', gap: 12 }}>
              <strong style={{ fontSize: 14 }}>{name}</strong>
              <span className="muted tiny" style={{ textAlign: 'right' }}>
                {what}
              </span>
            </div>
          ))}
        </div>
        <p className="tiny muted" style={{ marginTop: 12 }}>
          The document-detection and perspective-correction approach was informed by the open-source
          “SmartScan CV” document-scanner project by Vanshika Rathore, re-implemented here from scratch
          in TypeScript to fit this app.
        </p>
      </div>

      <div className="card card-pad">
        <h3 className="section-title">
          <ShieldCheck size={16} /> Privacy
        </h3>
        <ul className="tiny muted" style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Receipts are read on your device; nothing is uploaded by the on-device reader.</li>
          <li>
            Card numbers, phone numbers, addresses and names are blacked out of the image and removed
            from the text before any AI step.
          </li>
          <li>Saved receipts stay in this browser's storage unless you export them.</li>
        </ul>
      </div>

      <div className="card card-pad">
        <h3 className="section-title">License</h3>
        <p className="tiny muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
          © {new Date().getFullYear()} {BRAND.maker}. All rights reserved. This is a private,
          proprietary application — it is not open source. No part of it may be copied, modified,
          distributed or reused without written permission from the author. See the LICENSE file for
          the full terms.
        </p>
      </div>
    </div>
  );
}
