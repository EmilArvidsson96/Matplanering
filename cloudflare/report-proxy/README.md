# Report worker (Cloudflare Worker)

Receives in-app bug/idea/unsupported-recipe-site reports from
`src/api/feedback.ts` and files them as GitHub issues on this repo.

This exists so the app (a static site with no backend of its own) can file
issues without shipping a GitHub token in the browser bundle — a token
baked into `import.meta.env.VITE_GITHUB_TOKEN` at build time ends up in the
public JS and is readable by anyone who opens dev tools on the deployed
site. This Worker holds the token instead, as a Worker secret that never
reaches the client.

## One-time setup

1. **Cloudflare account** — free at https://dash.cloudflare.com/sign-up.

2. **Log in from this folder** (or use a Cloudflare API token — see below
   for non-interactive setups like CI or a sandboxed agent):
   ```
   cd cloudflare/report-proxy
   npx wrangler login
   ```

3. **GitHub token** — create a fine-grained personal access token scoped to
   *only* this repo and *only* Issues:
   - https://github.com/settings/personal-access-tokens/new
   - Resource owner: your account
   - Repository access: **Only select repositories** → `Matplanering`
   - Permissions: **Issues** → Read and write. Leave everything else at No access.
   - Generate, copy the token (starts with `github_pat_`).

4. **Store it as a Worker secret** (never committed to git):
   ```
   npx wrangler secret put GITHUB_TOKEN
   ```
   Paste the token when prompted.

5. **Deploy:**
   ```
   npx wrangler deploy
   ```
   Prints the Worker's URL, e.g. `https://matplanering-report.<your-subdomain>.workers.dev`.

6. **Wire it into the app** — put that URL in `src/api/feedback.ts`
   (the `REPORT_ENDPOINT` constant), then commit and push.

7. Once this is live, the `VITE_GITHUB_TOKEN` GitHub Actions secret used for
   `npm run build` (see `.github/workflows/deploy.yml`) no longer needs
   Issues access — it's still used by `src/api/github.ts` for the app's own
   data storage (weeks/library/settings synced to the private
   `matplanering-data` repo), so don't delete it, just narrow its scope on
   GitHub to that repo only.

## Non-interactive deploy (CI / an agent without a browser)

`wrangler login` needs a browser. To deploy without one:

1. Create a Cloudflare API token at
   https://dash.cloudflare.com/profile/api-tokens → **Create Token** →
   **Edit Cloudflare Workers** template → scope it to the account.
2. Export it as `CLOUDFLARE_API_TOKEN` in the environment running `wrangler`
   (never commit it). `wrangler deploy` and `wrangler secret put` both pick
   it up automatically.
3. `wrangler secret put GITHUB_TOKEN` still needs the token value on stdin —
   pipe it in rather than typing it interactively, e.g.
   `echo "$GITHUB_PAT_VALUE" | npx wrangler secret put GITHUB_TOKEN`, with
   `GITHUB_PAT_VALUE` itself passed in as an environment variable, not typed
   into a shell history or a chat transcript.

## Redeploying after code changes

```
cd cloudflare/report-proxy
npx wrangler deploy
```

## Rotating the token

Generate a new fine-grained token the same way, then re-run
`npx wrangler secret put GITHUB_TOKEN` and revoke the old one on GitHub.

## Notes

- `ALLOWED_ORIGIN` in `worker.js` is hardcoded to
  `https://emilarvidsson96.github.io` — update it if the app ever moves to
  a different domain.
- Payloads are capped at 100KB and issue bodies truncated to 60,000
  characters (GitHub's hard cap is 65,536).
