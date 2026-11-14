/**
 * Small, dependency-free helpers for talking to a remote AI service: turning
 * HTTP failures into actionable messages and retrying transient failures. Kept
 * separate from the callers so they can be unit-tested without a DOM.
 */

/** An HTTP failure that keeps the status code so callers can decide to retry. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Turns an HTTP failure into a short, actionable message. */
export function describeHttpError(status: number, body: string): string {
  const detail = body.replace(/\s+/g, ' ').trim().slice(0, 160);
  switch (status) {
    case 400:
      return `The AI rejected the request (400).${detail ? ` ${detail}` : ''}`;
    case 401:
      return 'The AI key was rejected (401). Check the key in Settings.';
    case 402:
      return 'The AI account is out of credit (402).';
    case 403:
      return 'The AI provider refused the request (403).';
    case 404:
      return 'The AI model or endpoint was not found (404). Check the model name and base URL in Settings.';
    case 408:
      return 'The AI request timed out (408). Try again.';
    case 413:
      return 'The receipt image was too large for the AI provider (413).';
    case 429:
      return 'The AI is busy or rate-limited (429). Try again in a moment.';
    case 500:
    case 502:
    case 503:
    case 504:
      return `The AI gateway is temporarily unavailable (${status}).`;
    case 0:
      return detail || 'Could not reach the AI service.';
    default:
      return `AI reading failed (${status}).${detail ? ` ${detail}` : ''}`;
  }
}

/** Transient failures worth a retry: rate limits and server/gateway errors. */
export function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Runs `attempt` up to `retries + 1` times, retrying only when `shouldRetry`
 * says so (default: a transient {@link HttpError}). Non-retryable errors and the
 * final failure are rethrown as-is.
 */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  options: { retries?: number; delayMs?: number; shouldRetry?: (err: unknown) => boolean } = {},
): Promise<T> {
  const retries = options.retries ?? 1;
  const delayMs = options.delayMs ?? 700;
  const shouldRetry = options.shouldRetry ?? ((err: unknown) => err instanceof HttpError && isRetryable(err.status));

  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err;
      if (i === retries || !shouldRetry(err)) throw err;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
