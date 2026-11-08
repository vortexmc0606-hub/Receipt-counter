# AGENTS.md

## Project

Receipt Scanner — a React web app that scans receipts (OCR or a vision model), extracts line items
and prices, stores them date-wise in the browser, and answers natural-language questions about the
data. An optional Node/Express backend (`server/`) can hold the LLM key and store receipts.

## Commands

```bash
npm install             # install frontend dependencies
npm run dev             # Vite dev server on http://localhost:12000 (host 0.0.0.0)
npm run build           # tsc -b && vite build -> dist/
npm run preview         # serve the production build
npm run typecheck       # tsc -b --noEmit
npm test                # unit tests for the pure logic (scripts/tests/*.test.ts)

npm run install:server  # install backend dependencies (server/)
npm run dev:server      # backend dev server on http://localhost:8787
npm run build:server    # compile the backend
npm run typecheck:server
```

The dev server is pinned to port 12000 because that port is exposed publicly in this environment
(see the `work_hosts` context). `vite.config.ts` sets `allowedHosts: true` and proxies `/api` to the
backend so the frontend can use the same origin during development.

## Architecture

```
src/
  types.ts             Domain types (Receipt, ReceiptItem, Settings, ChatMessage) + CATEGORIES
  App.tsx              Shell: tab routing, load/save receipts + settings + learning, theme, sync
  components/
    ui.tsx             Modal, Stat, Empty primitives
    Dashboard.tsx      Stats, monthly bar chart, category pie, top merchants, savings chart
    ScanView.tsx       Camera/upload/drag-drop -> backend/AI/OCR -> editable review -> save
    ReceiptsView.tsx   Date-grouped list, search, category filter, detail modal, CSV export
    Assistant.tsx      Chat UI; local engine first, then backend, then direct LLM
    SettingsView.tsx   Currency, theme, photo cleanup, backend, LLM endpoint, import/export
    Trends.tsx         Price history for a single item over time
    Stores.tsx         Per-store/restaurant spend; click a store to see its receipts
    LearningView.tsx   What the app has learned from corrections
  lib/
    ocr.ts             Tesseract.js worker (cached), thumbnails, image load
    parser.ts          Heuristic receipt text -> structured receipt (pure, testable)
    ai.ts              Optional direct-to-provider vision reading (browser-held key)
    api.ts             Client for the backend (server-held key); optional receipt sync
    stores.ts          Brand/restaurant catalog + recognizeStore()
    category.ts        Item categorisation, learns from corrections
    learning.ts        On-device learning: merchants, items, printed codes, stores
    db.ts              IndexedDB via idb: receipts, settings, learning stores
    assistant.ts       Local NL query engine + optional OpenAI-compatible client
    env.ts             Build-time defaults from Vite env vars
    utils.ts           Money/date formatting, grouping, aggregations, CSV
  styles.css           Design tokens (light/dark, Volt blue), Liquid Glass, animations

server/
  src/index.ts         Entry point
  src/app.ts           Express app: routes, CORS, optional x-app-key guard
  src/config.ts        Environment configuration
  src/lib/llm.ts       Vision reading + chat against an OpenAI-compatible endpoint
  src/lib/store.ts     Receipts persisted to a JSON file (atomic writes)
  src/lib/context.ts   Receipts -> text for the assistant prompt
```

## Key decisions

- **The app works with no backend.** OCR (Tesseract.js) and storage (IndexedDB) run in the browser.
  The backend is optional and, when set, is preferred for reading and answering because it keeps the
  LLM key server-side. Never break the on-device-only path.
- **Reading order in `ScanView`:** backend (`apiBaseUrl`) -> direct vision model (`aiReading`) ->
  on-device Tesseract OCR. Each falls through to the next on failure, so a scan never hard-fails.
- **Parser is pure and framework-free** so it can be tested directly with `node`.
  `parseReceiptText()` returns a `ParsedReceipt`; `parsedToReceipt()` wraps it into a stored `Receipt`.
- **Assistant is local-first.** `answerLocally()` handles totals, categories, merchants, item lookup,
  averages, counts, and date ranges deterministically. Unmatched questions go to the backend, then to
  a directly configured LLM. Keep new intents ordered before the generic "total spend" fallback.
- **Store recognition** uses the shared catalog in `stores.ts`; unknown headers are cleaned up and
  remembered in the learning store so the list grows with use.
- **The theme is "Volt blue"** (`--primary: #2563eb` light, `#3b82f6` dark).

## Testing the pure logic

`npm test` (`scripts/run-tests.mjs`) compiles `scripts/tests/*.test.ts` with the local esbuild and runs
them under `node:test`. Suites cover the parser, dates, tax/geo and store recognition. Add a case there
for any parsing bug you fix — real receipt text (from `Training/*.HEIC` OCR) beats invented fixtures.

You can also bundle any `src/lib/*` module ad hoc:

```bash
./node_modules/.bin/esbuild /tmp/test.mjs --bundle --platform=node --format=esm --outfile=/tmp/test.bundle.mjs
node /tmp/test.bundle.mjs
```

Prefer real code paths over mocks.

## OCR and parsing notes (measured, not guessed)

- **Page-segmentation mode matters more than preprocessing.** Measured mean word confidence over 10
  receipt photos: `SINGLE_BLOCK` (Tesseract's default, and what the app used originally) scores
  39–49, while `AUTO`/`SINGLE_COLUMN`/`SPARSE_TEXT` score 58–63. `recognizeReceiptPasses()` therefore
  tries the good modes first and stops early once a pass parses well; it never uses `SINGLE_BLOCK`.
- **Resolution sweet spot is ~2000–2400px on the long edge** (`scan.ts` `maxEdge`). Bigger gains nothing.
- **Binarization hurts**; a cleaned grayscale/illumination-corrected image reads better.
- **Summary lines often print the amount before the label** ("247.65 TOTAL PURCHASE", "Amount: 81.41").
  `NON_ITEM` is anchored to line start, so `SUMMARY_ANYWHERE`/`TOTAL_LINE` catch these anywhere.
- **Receipts are recent documents.** `parseReceiptDate` scores candidates and rejects dates years in the
  past or future, so a phone number or SKU that looks date-like cannot win over the real date.

## Git / remote notes

- Remote: `github.com/vortexmc0606-hub/Receipt-counter`, default branch `main`.
- Authenticate pushes with the `GITHUB_TOKEN` environment variable:
  `git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@github.com/vortexmc0606-hub/Receipt-counter.git`
  then `git push origin main`, then reset the remote to the plain URL. Never commit the token.
- Never force-push. Keep commits small and descriptive.

