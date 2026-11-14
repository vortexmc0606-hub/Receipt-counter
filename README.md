# Receipt Scanner

Scan receipts with your camera or upload photos, and the app reads every line item and price into a
date-organised spending record. An assistant answers questions about your data in plain English.

Everything runs in the browser. Receipt images and text never leave your device unless you add your
own LLM endpoint in Settings, or point the app at the optional backend.

## Backend (optional)

`server/` holds a small Node/Express API that keeps the LLM API key on the server
instead of in the browser, and can store receipts so they sync across devices.
That is the safest way to give everyone one shared key without exposing it.

- The app stays fully functional on-device with no backend.
- Set the backend URL in **Settings → Backend** (or build with `VITE_API_BASE_URL`).
- See [`server/README.md`](server/README.md) for setup, configuration, and the API.

## Features

- **Scan receipts** — camera capture, file upload, or drag and drop. OCR runs locally with Tesseract.js.
- **Automatic parsing** — detects merchant, date, line items, quantity, subtotal, tax, and total.
  Every field is editable before you save.
- **Date-wise records** — receipts grouped by day, with daily totals, search, and category filters.
- **Dashboard** — total spent, this month, average receipt, monthly bar chart, category pie chart,
  top merchants, and recent receipts.
- **Assistant** — ask "How much did I spend on groceries?", "Show my top merchants",
  "What are my most expensive items?", or "List my receipts in March". Common questions are answered
  offline with a built-in query engine. Add any OpenAI-compatible endpoint in Settings for
  open-ended questions.
- **Data ownership** — stored in IndexedDB. Export to JSON (backup) or CSV (spreadsheet).
- **Dark mode** and mobile-friendly layout.

## Getting started

```bash
npm install
npm run dev      # http://localhost:12000
```

Build for production:

```bash
npm run build    # output in dist/
npm run preview  # serve the build
```

## Deploying

The build is a static site, so any static host works (Vercel, Netlify, GitHub Pages, Cloudflare Pages).

- **Vercel / Netlify**: import the repo. Build command `npm run build`, output directory `dist`.
- **GitHub Pages**: publish the `dist/` folder.

## Tech

React 18 · TypeScript · Vite · Tesseract.js · IndexedDB (idb) · Recharts · lucide-react

## Privacy

OCR runs on-device. Receipts live in the browser's IndexedDB. The only outbound request is to the OCR
model files (CDN, first run only) and, if you configure it, your own LLM endpoint.
