import { chat, configured, extractJson, json, RECEIPT_GUARDRAILS, type Env } from "../_lib/llm";

const SYSTEM = `You are a careful receipt extraction system. Extract only what is visibly supported by the receipt image. Return one JSON object only, no markdown.

Required shape:
{
  "merchant": string,
  "date": "YYYY-MM-DD" | null,
  "currency": string | null,
  "items": [{ "name": string, "qty": number | null, "price": number | null, "category": string, "code": string | null }],
  "subtotal": number | null,
  "tax": number | null,
  "taxRate": number | null,
  "total": number | null,
  "savings": number | null,
  "warnings": string[]
}

For each item, price means the printed extended line total (not unit price) when one is shown. Keep quantity separate. Do not include subtotal, tax, total, savings, payment/tender lines, store address, card details or identifiers as items. Use null when a field cannot be read. Never infer a date from the current date. Use ISO currency code only when clear. For fuel, describe fuel as a line item only if the receipt clearly charges it; preserve gallons and unit price in the item name or warning rather than mixing units. If a receipt has multiple photos, they must be grouped by the caller; this endpoint accepts one image at a time.`;

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (!configured(env)) return json({ error: "AI reading is not configured." }, 503);
  let body: { image?: unknown };
  try { body = await request.json() as { image?: unknown }; }
  catch { return json({ error: "Request body must be valid JSON." }, 400); }
  if (typeof body.image !== "string" || !/^data:image\\/(jpeg|jpg|png|webp);base64,/i.test(body.image)) {
    return json({ error: "Expected a JPEG, PNG or WebP image data URL." }, 400);
  }
  if (body.image.length > 18_000_000) return json({ error: "Image is too large. Please use a smaller scan." }, 413);
  try {
    const content = await chat(env, [{
      role: "user",
      content: [
        { type: "text", text: SYSTEM + "\\n\\n" + RECEIPT_GUARDRAILS },
        { type: "image_url", image_url: { url: body.image } },
      ],
    }], env.VISION_MODEL || env.LLM_MODEL, 3000);
    const parsed = extractJson(content);
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((x): x is string => typeof x === "string") : [];
    const numberOrNull = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 200).map((item) => {
      const x = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        name: typeof x.name === "string" ? x.name.slice(0, 160) : "Unclear item",
        qty: numberOrNull(x.qty),
        price: numberOrNull(x.price),
        category: typeof x.category === "string" ? x.category : "Other",
        code: typeof x.code === "string" ? x.code.slice(0, 64) : undefined,
      };
    }) : [];
    return json({
      merchant: typeof parsed.merchant === "string" ? parsed.merchant.slice(0, 120) : "Unknown merchant",
      date: typeof parsed.date === "string" ? parsed.date : "",
      currency: typeof parsed.currency === "string" ? parsed.currency : null,
      items,
      subtotal: numberOrNull(parsed.subtotal) ?? undefined,
      tax: numberOrNull(parsed.tax) ?? undefined,
      taxRate: numberOrNull(parsed.taxRate) ?? undefined,
      total: numberOrNull(parsed.total) ?? 0,
      savings: numberOrNull(parsed.savings) ?? undefined,
      rawText: "",
      warnings: [...warnings, "AI-extracted values must be checked against the receipt photo before saving."],
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Receipt reading failed." }, 502);
  }
};
