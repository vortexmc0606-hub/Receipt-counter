# AGENTS.md

## Project

Receipt Scanner — a client-only React web app that scans receipts (OCR), extracts line items and
prices, stores them date-wise in the browser, and answers natural-language questions about the data.

## Commands

```bash
npm install          # install dependencies
npm run dev          # Vite dev server on http://localhost:12000 (host 0.0.0.0)
npm run build        # tsc -b && vite build -> dist/
npm run preview      # serve the production build
npm run typecheck    # tsc -b --noEmit
```

The dev server is pinned to port 12000 because that port is exposed publicly in this environment
(see the `work_hosts` context). `vite.config.ts` sets `allowedHosts: true` so the proxied hostname
works.

## Architecture

```
src/
  types.ts             Domain types (Receipt, ReceiptItem, Settings, ChatMessage) + CATEGORIES
  App.tsx              Shell: tab routing, load/save receipts + settings, theme
  components/
    ui.tsx             Modal, Stat, Empty primitives
    Dashboard.tsx      Stats, monthly bar chart, category pie, top merchants, recent
    ScanView.tsx       Camera/upload/drag-drop -> OCR -> editable review -> save
    ReceiptsView.tsx   Date-grouped list, search, category filter, detail modal, CSV export
    Assistant.tsx      Chat UI; local engine first, optional LLM fallback
    SettingsView.tsx   Currency, theme, LLM endpoint, JSON import/export, clear data
  lib/
    ocr.ts             Tesseract.js worker (cached), thumbnail generation
    parser.ts          Heuristic receipt text -> structured receipt (pure, testable)
    db.ts              IndexedDB via idb: receipts + settings stores
    assistant.ts       Local NL query engine + optional OpenAI-compatible client
    utils.ts           Money/date formatting, grouping, aggregations, CSV
  styles.css           Design tokens (light/dark), component styles
```

## Key decisions

- **No backend.** OCR (Tesseract.js) and storage (IndexedDB) run in the browser. Nothing is uploaded
  unless the user configures their own LLM endpoint.
- **Parser is pure and framework-free** so it can be tested directly with `node --experimental-strip-types`.
  `parseReceiptText()` returns a `ParsedReceipt`; `parsedToReceipt()` wraps it into a stored `Receipt`.
- **Assistant is local-first.** `answerLocally()` handles totals, categories, merchants, item lookup,
  averages, counts, and date ranges deterministically. Only unmatched questions fall through to the
  optional LLM. Keep new intents ordered before the generic "total spend" fallback.
- **Categories** are guessed from item-name keywords (`guessCategory`) and are user-editable.

## Testing the pure logic

`src/lib/parser.ts` and `src/lib/assistant.ts` import each other only through `utils.ts`/`parser.ts`,
so bundle a quick script with the local esbuild:

```bash
./node_modules/.bin/esbuild /tmp/test.mjs --bundle --platform=node --format=esm --outfile=/tmp/test.bundle.mjs
node /tmp/test.bundle.mjs
```

Node's `--experimental-strip-types` needs explicit `.ts` extensions in import paths, so bundling is
easier than running the TS directly.

## Git / remote notes

- Remote: `github.com/vortexmc0606-hub/Receipt-counter`, default branch `main`.
- In this environment `GITHUB_TOKEN` authenticates to the API but is **read-only** — `git push` and
  all write endpoints return 403. Commit locally and push from an environment with write access.
- Never push directly to `main`; use a feature branch.
