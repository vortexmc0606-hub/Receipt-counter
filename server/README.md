# Lumen — Backend

A small Node/Express service for the Lumen app. It does two jobs:

1. **Holds the LLM API key.** The browser sends the receipt image or a question to
   this server; the server calls the model provider. The key never ships to the
   browser, so one key can serve every visitor without leaking it.
2. **Stores receipts** (optionally), so they are available across devices.

The frontend still works fully on-device when no backend URL is set.

## Run it

```bash
cd server
cp .env.example .env      # fill in LLM_API_KEY etc.
npm install
npm run dev               # http://localhost:8787
```

Production:

```bash
npm run build && npm start
```

## Configure the frontend

In the app, open **Settings → Backend**, enter the backend URL, tick
**Sync receipts with the backend** if you want cross-device receipts, and press
**Test connection**. During local development, `npm run dev` in the repo root
proxies `/api` to `http://localhost:8787`, so you can use `http://localhost:12000`
as the backend URL.

To bake the backend URL into a build, set `VITE_API_BASE_URL` (and optionally
`VITE_BACKEND_SYNC=true`) when building the frontend.

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/health` | Liveness + whether AI reading is configured |
| `GET`  | `/api/ai/status` | `{ enabled, model, visionModel }` |
| `POST` | `/api/parse` | `{ image }` (data URL) → a structured receipt |
| `POST` | `/api/assistant` | `{ question, receipts?, currency?, history? }` → `{ content }` |
| `GET`  | `/api/receipts` | List stored receipts |
| `POST` | `/api/receipts` | Save one receipt, or `{ receipts: [...] }` to save many |
| `DELETE` | `/api/receipts/:id` | Delete one receipt |
| `DELETE` | `/api/receipts` | Delete all receipts |

## Configuration

All settings come from the environment — see `.env.example`. The important ones:

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `8787` | |
| `LLM_BASE_URL` | — | OpenAI-compatible endpoint, e.g. `https://api.openai.com/v1` |
| `LLM_API_KEY` | — | Required for AI reading and the assistant |
| `LLM_MODEL` | `gpt-4o-mini` | Model for the assistant |
| `VISION_MODEL` | `gpt-4o-mini` | Model for reading receipt images |
| `DATA_FILE` | `server/data/receipts.json` | Receipt store |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins, or `*` |
| `APP_KEY` | — | Optional shared secret; clients send it as `x-app-key` |

## Notes

- Receipts are kept in a single JSON file written atomically (temp file + rename),
  which is plenty for personal scale and trivial to back up.
- The server sends the image straight to the configured provider and keeps no
  copy of it.
