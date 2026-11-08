import type { Settings } from '../types';

/**
 * Values baked in from Vite environment variables at build/dev time.
 *
 * The API key is supplied through `.env.local`, which is gitignored, so it is
 * never committed. It is only a convenience prefill: anything the user types in
 * Settings (stored in IndexedDB) takes precedence, and the key is still sent
 * straight from the browser to the endpoint, never through a server.
 */
export const ENV_DEFAULTS: Partial<Settings> = {
  llmBaseUrl: import.meta.env.VITE_LLM_BASE_URL || undefined,
  llmApiKey: import.meta.env.VITE_LLM_API_KEY || undefined,
  llmModel: import.meta.env.VITE_LLM_MODEL || undefined,
  visionModel: import.meta.env.VITE_VISION_MODEL || undefined,
  aiReading: import.meta.env.VITE_AI_READING ? import.meta.env.VITE_AI_READING === 'true' : undefined,
};
