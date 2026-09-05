# Recipe fetch CORS proxy (Cloudflare Worker)

Replaces corsproxy.io (which requires a paid plan for production domains) with a
self-hosted proxy used by `fetchRecipeFromUrl()` in `src/utils/recipeFetcher.ts`.

## Deploy (dashboard, no CLI needed)

1. Go to https://dash.cloudflare.com → sign up / log in (free).
2. **Workers & Pages** → **Create** → **Create Worker**.
3. Give it a name (e.g. `matplanering-recipe-proxy`) → **Deploy** (deploys the default template first).
4. **Edit code**, replace the contents with `worker.js` from this folder, **Deploy** again.
Deployed at `https://matplanering-recipe-proxy.emil-arvidsson.workers.dev/`, referenced
directly as `CORS_PROXY` in `recipeFetcher.ts`.

Free tier: 100,000 requests/day, no credit card, no expiry.

## Notes

- `ALLOWED_ORIGIN` in `worker.js` is hardcoded to `https://emilarvidsson96.github.io` — update it if the app ever moves to a different domain.
- The worker refuses non-`https://` targets and private/loopback IPs as a basic SSRF guard, but does not restrict which public hostnames it can fetch — treat the worker URL as effectively public once deployed.
