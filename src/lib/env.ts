import type { Settings } from '../types';

/**
 * Values baked in from Vite environment variables at build/dev time.
 *
 * The key is supplied through `.env.local` (gitignored) or, for the deployed
 * build, repository secrets injected by the GitHub Actions workflow. When a
 * shared key is present it is used for everyone; otherwise the app falls back to
 * whatever the user typed in Settings. The key is sent straight from the browser
 * to the endpoint, never through a server.
 */
export const ENV_DEFAULTS: Partial<Settings> = {
  llmBaseUrl: import.meta.env.VITE_LLM_BASE_URL || undefined,
  llmApiKey: import.meta.env.VITE_LLM_API_KEY || undefined,
  llmModel: import.meta.env.VITE_LLM_MODEL || undefined,
  visionModel: import.meta.env.VITE_VISION_MODEL || undefined,
  aiReading: import.meta.env.VITE_AI_READING ? import.meta.env.VITE_AI_READING === 'true' : undefined,
};

/**
 * True when the build carries a shared key. The app then uses that key for
 * everyone and the connection fields in Settings become read-only, so a visitor
 * never has to supply their own.
 */
export const HAS_SHARED_KEY = Boolean(ENV_DEFAULTS.llmApiKey);
