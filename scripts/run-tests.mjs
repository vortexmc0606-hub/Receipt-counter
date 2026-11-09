/**
 * Runs the unit tests under scripts/tests with Node's built-in test runner.
 *
 * The sources are TypeScript and the tests import them directly, so the test
 * files are bundled with esbuild first (there is no test runner in the browser
 * build). Usage: `npm test`.
 */
import { build } from 'esbuild';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const testDir = new URL('./tests/', import.meta.url).pathname;

/** Recursively collects *.test.ts files so tests can live in subfolders. */
function collect(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...collect(full));
    else if (entry.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

const files = collect(testDir);

if (!files.length) {
  console.error('No test files found in scripts/tests.');
  process.exit(1);
}

const out = mkdtempSync(join(tmpdir(), 'rc-tests-'));
try {
  await build({
    entryPoints: files,
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
