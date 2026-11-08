/**
 * Runs the unit tests under scripts/tests with Node's built-in test runner.
 *
 * The sources are TypeScript and the tests import them directly, so the test
 * files are bundled with esbuild first (there is no test runner in the browser
 * build). Usage: `npm test`.
 */
import { build } from 'esbuild';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const testDir = new URL('./tests/', import.meta.url).pathname;
const files = readdirSync(testDir).filter((f) => f.endsWith('.test.ts'));

if (!files.length) {
  console.error('No test files found in scripts/tests.');
  process.exit(1);
}

const out = mkdtempSync(join(tmpdir(), 'rc-tests-'));
try {
  await build({
    entryPoints: files.map((f) => join(testDir, f)),
    outdir: out,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    loader: { '.ts': 'ts' },
    logLevel: 'warning',
  });

  const result = spawnSync('node', ['--test'], { stdio: 'inherit', cwd: out });
  process.exit(result.status ?? 1);
} finally {
  rmSync(out, { recursive: true, force: true });
}
