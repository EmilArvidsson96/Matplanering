# Recipe fetch CORS proxy (Cloudflare Worker)

Replaces corsproxy.io (which requires a paid plan for production domains) with a
self-hosted proxy used by `fetchRecipeFromUrl()` in `src/utils/recipeFetcher.ts`.

## Deploy (dashboard, no CLI needed)

1. Go to https://dash.cloudflare.com → sign up / log in (free).
2. **Workers & Pages** → **Create** → **Create Worker**.
3. Give it a name (e.g. `matplanering-recipe-proxy`) → **Deploy** (deploys the default template first).
4. **Edit code**, replace the contents with `worker.js` from this folder, **Deploy** again.
5. Copy the resulting URL — looks like `https://matplanering-recipe-proxy.<your-subdomain>.workers.dev`.
6. Send that URL back so it can be wired into `recipeFetcher.ts`.

Free tier: 100,000 requests/day, no credit card, no expiry.

## Notes

- `ALLOWED_ORIGIN` in `worker.js` is hardcoded to `https://emilarvidsson96.github.io` — update it if the app ever moves to a different domain.
- The worker refuses non-`https://` targets and private/loopback IPs as a basic SSRF guard, but does not restrict which public hostnames it can fetch — treat the worker URL as effectively public once deployed.
