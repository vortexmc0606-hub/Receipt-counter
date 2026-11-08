/**
 * Server configuration, read once from the environment.
 *
 * The LLM API key lives here and never leaves the server: the browser talks to
 * this backend, and the backend talks to the model provider. That is the whole
 * point of having a backend for this app.
 */

function num(value: string | undefined, fallback: number): number {
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: num(process.env.PORT, 8787),
  host: process.env.HOST || '0.0.0.0',

  /** OpenAI-compatible chat completions base URL, e.g. https://api.openai.com/v1 */
  llmBaseUrl: process.env.LLM_BASE_URL || '',
  llmApiKey: process.env.LLM_API_KEY || '',
  llmModel: process.env.LLM_MODEL || 'gpt-4o-mini',
  visionModel: process.env.VISION_MODEL || 'gpt-4o-mini',

  /** Where receipts are persisted (a JSON file, no database needed). */
  dataFile: process.env.DATA_FILE || new URL('../data/receipts.json', import.meta.url).pathname,

  /** Comma-separated list of allowed browser origins, or '*' for any. */
  corsOrigin: process.env.CORS_ORIGIN || '*',

  /** Max upload size for a receipt image. */
  maxUploadBytes: num(process.env.MAX_UPLOAD_BYTES, 12 * 1024 * 1024),

  /**
   * Optional shared secret. When set, every /api request must send it as
   * `x-app-key`. Leave empty for a fully public backend.
   */
  appKey: process.env.APP_KEY || '',
} as const;

export const hasLlm = (): boolean => Boolean(config.llmBaseUrl && config.llmApiKey);
