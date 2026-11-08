# Receipt Scanner — project brief for automated sessions

This file is the durable memory for an OpenHands automation that keeps improving
this app. Read it first, then `AGENTS.md`, then the code.

## What this app is

A React + TypeScript + Vite web app that scans receipts, extracts every line item
and price into a date-wise record, and answers questions about that data. It has
an optional Node/Express backend (`server/`) that keeps the LLM API key server-side
and can store receipts.

- Repository: `vortexmc0606-hub/Receipt-counter`
- Branch: `main`
- Live site: https://vortexmc0606-hub.github.io/Receipt-counter/
- Local dev: `npm install && npm run dev` (http://localhost:12000)
- Backend dev: `npm run install:server && npm run dev:server` (http://localhost:8787)

## Original requests (chronological, from the build conversation)

Each item below is a request the user made. The automation must check the current
code against each one and finish anything that is not fully done.

1. Scan receipts; extract items and prices in a date-wise format. **Done.**
2. Add an assistant to find things in the data. **Done.**
3. Build it in React. **Done.**
4. Clone `vortexmc0606-hub/Receipt-counter`, branch `main`; push as a live web app. **Done.**
5. Read receipts accurately: a price of 81.41 was read as 41; then "61 41, never 81".
   Keep improving OCR/parsing accuracy for prices. **Ongoing — verify and improve.**
6. Do not count the "you saved" lines as items; add AI enhancement and read with the
   provided key. **Done — verify savings are excluded from items.**
7. Use one API key for everyone. **Done via the backend — verify the browser never
   needs a key.**
8. "Bad gateway when it scans" — scanning must not fail with a gateway error.
   **Verify the backend path returns clear errors and falls back to on-device OCR.**
9. Make it as accurate as possible. **Ongoing.**
10. Train it to read the user's receipts (a `training.zip` was supplied). **Verify
    the on-device learning path actually learns merchant, items, codes and categories
    from corrections.**
11. Enhance the photo like Apple's document scanner (shadow removal, deskew, crop,
    threshold). **Done — verify.**
12. Add a trend of one item's price over time. **Done — `Trends` tab.**
13. Train it to recognise an item from the code printed on the receipt. **Done —
    line-code memory in `learning.ts`; verify.**
14. Very intelligent category recognition. **Ongoing — improve `category.ts`.**
15. Fidelity check; keep working until everything is top notch; add fancy animations
    and a "Liquid Glass" look. **Verify animations and glass styling.**
16. "Volt blue" theme. **Done — primary colour is Volt blue (#2563eb / #3b82f6).**
17. Store is usually listed at the top, so check for it; add a savings graph; add
    store/restaurant recognition so clicking Walmart shows Walmart spend; include as
    many brands and restaurants as possible, and when a store is new, take its name
    from the receipt and add it to the list. **Done — `stores.ts`, `Stores` tab,
    savings chart; keep expanding the catalog.**
18. Make a backend so the app can be updated whenever. **Done — `server/`.**

## Rules for automated sessions

- Read `AGENTS.md` for build commands and conventions.
- Do not break the on-device-only mode: the app must still work with no backend.
- Never commit secrets. The LLM key lives in `server/.env` or the backend's env.
- Run `npm run typecheck`, `npm run build`, and `npm run typecheck:server` before
  committing. Fix anything that fails.
- Keep commits small and messages descriptive.
- If a request above is already fully satisfied, say so in the report and move on.
  Do not redo finished work or rewrite working code for style alone.
- If nothing needs changing, do not open a pull request.
