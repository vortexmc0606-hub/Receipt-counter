import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, describeHttpError, isRetryable, withRetry } from '../../src/lib/net';

test('retryable statuses are 408/429 and 5xx', () => {
  assert.equal(isRetryable(408), true);
  assert.equal(isRetryable(429), true);
  assert.equal(isRetryable(500), true);
  assert.equal(isRetryable(502), true);
  assert.equal(isRetryable(503), true);
  assert.equal(isRetryable(504), true);
  assert.equal(isRetryable(400), false);
  assert.equal(isRetryable(401), false);
  assert.equal(isRetryable(404), false);
});

test('gateway errors read as temporarily unavailable', () => {
  assert.match(describeHttpError(502, '<html>Bad Gateway</html>'), /temporarily unavailable \(502\)/);
  assert.match(describeHttpError(503, ''), /temporarily unavailable \(503\)/);
});

test('key and credit problems point at Settings', () => {
  assert.match(describeHttpError(401, ''), /key was rejected/);
  assert.match(describeHttpError(402, ''), /out of credit/);
  assert.match(describeHttpError(404, ''), /Settings/);
});

test('a 400 keeps a trimmed snippet of the provider message', () => {
  const msg = describeHttpError(400, '  invalid   image\nformat  ');
  assert.match(msg, /\(400\)/);
  assert.match(msg, /invalid image format/);
});

test('withRetry retries a transient failure then succeeds', async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 2) throw new HttpError(502, 'bad gateway');
      return 'ok';
    },
    { retries: 2, delayMs: 0 },
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
});

test('withRetry does not retry a non-retryable error', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw new HttpError(401, 'nope');
      },
      { retries: 3, delayMs: 0 },
    ),
    /nope/,
  );
  assert.equal(calls, 1);
});

test('withRetry gives up after the retry budget and rethrows the last error', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw new HttpError(503, 'still down');
      },
      { retries: 2, delayMs: 0 },
    ),
    /still down/,
  );
  assert.equal(calls, 3);
});
