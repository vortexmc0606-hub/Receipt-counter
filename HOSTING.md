# Hosting Lumen

Lumen builds to a folder of static files (`dist/`), so it runs on any static
host. GitHub Pages is already wired up and free. This page lists the other
free options and how to switch to them.

## The one rule for moving hosts

The build writes asset paths with a base prefix. GitHub Pages serves the app
from a sub-path (`/Receipt-counter/`), so the Pages workflow sets
`GITHUB_PAGES=true`. Every other host below serves from the site root (`/`),
which is the default. So:

- **On a root host** (Netlify, Vercel, Cloudflare, Firebase, S3 root): do
  nothing — the default build is correct.
- **Keep the Pages build** as-is by only setting `GITHUB_PAGES` in the Pages
  workflow, which it already does.

If you ever see a blank page with 404s for `/assets/...`, it means the base
prefix does not match the URL the site is served from.

## Free options, compared

| Host | Free tier | Custom domain | Always-on | Notes |
| --- | --- | --- | --- | --- |
| **GitHub Pages** (current) | Yes, generous | Yes | Yes | Already deployed. Simplest. |
| **Cloudflare Pages** | Yes, unlimited bandwidth | Yes | Yes | Best free tier; global CDN. |
| **Netlify** | 100 GB/month | Yes | Yes | Drag-and-drop or Git. Config added. |
| **Vercel** | Hobby tier | Yes | Yes | Git import. Config added. |
| **Firebase Hosting** | 10 GB/month, 360 MB/day | Yes | Yes | Good if you already use Google. |
| **AWS S3 + CloudFront** | 12-month free tier only | Yes | Yes | **Not free forever** — after 12 months you pay for storage and requests. |

If you specifically want "S3-style" but free forever, Cloudflare R2 is S3-compatible
with no egress fees, and you can put Cloudflare Pages in front of it.

## Deploy in 2 minutes (no account setup in the repo)

### Netlify (easiest)
1. Run `npm run build` locally.
2. Go to https://app.netlify.com/drop and drag the `dist/` folder in.
3. Done — you get a live URL. `netlify.toml` in this repo also lets Netlify
   build straight from the Git repo.

### Vercel
1. Import the repo at https://vercel.com/new.
2. Vercel reads `vercel.json` (build `npm run build`, output `dist`).
3. Deploy.

### Cloudflare Pages
1. Create a Pages project, connect the repo.
2. Build command `npm run build`, output directory `dist`.
3. Or use the included workflow: add `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` secrets, then enable the `push:` trigger in
   `.github/workflows/deploy-cloudflare.yml`.

### Firebase Hosting
```bash
npm i -g firebase-tools
firebase login
firebase init hosting      # public dir: dist, single-page app: yes
npm run build
firebase deploy
```

### AWS S3 (note: free for only the first 12 months)
```bash
npm run build
aws s3 sync dist s3://YOUR_BUCKET --delete
# Static website hosting: set index.html and (for SPA routes) 404.html.
# Enable the index document and error document = index.html.
```
Put CloudFront in front for HTTPS and speed. Watch the billing dashboard —
this one stops being free after a year.

## Build-time configuration

AI reading uses a shared key baked in at build time from repository secrets.
Any host you use must pass the same variables at build time, or copy them into
Settings → Advanced in the running app:

- `VITE_LLM_BASE_URL`, `VITE_LLM_API_KEY`, `VITE_LLM_MODEL`, `VITE_VISION_MODEL`
- `VITE_AI_READING=true`
- `VITE_API_BASE_URL` (optional backend), `VITE_BACKEND_SYNC`

The Pages workflow already forwards these; the Cloudflare workflow does too.
