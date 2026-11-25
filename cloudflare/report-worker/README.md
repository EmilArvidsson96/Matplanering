# In-app report Worker (Cloudflare)

Receives bug reports / feature ideas from the feedback button (`FeedbackWidget`)
and files them as GitHub issues on the **private** `matplanering-data` repo,
labelled `in-app-report` + `bug`/`enhancement`. Same setup as budgetmanager's
report Worker.

Why a Worker: the app is a static site, and creating an issue needs a GitHub
token. A token in the client bundle (`VITE_*`) is readable by anyone who opens
the site, so the token lives here as a Worker secret instead. Anyone using the
app can report without a GitHub account and without leaving the app.

## One-time setup (dashboard, no CLI needed)

1. **GitHub token** — fine-grained personal access token:
   https://github.com/settings/personal-access-tokens/new
   - Repository access: **Only select repositories** → `matplanering-data`
   - Permissions: **Issues → Read and write**. Nothing else.
   - Copy the token (`github_pat_…`).
2. **Create the Worker** — https://dash.cloudflare.com → **Workers & Pages** →
   **Create** → **Create Worker** → name it **`matplanering-report`** (the app
   expects `https://matplanering-report.emil-arvidsson.workers.dev`) → **Deploy**.
3. **Edit code** → replace everything with `worker.js` from this folder → **Deploy**.
4. **Settings → Variables and Secrets → Add** → type **Secret**, name
   `GITHUB_TOKEN`, paste the token → **Deploy**.

The endpoint is set as `REPORT_ENDPOINT` in `src/api/feedback.ts`; change it
there if you name the Worker differently.

## Notes

- `ALLOWED_ORIGIN` is `https://emilarvidsson96.github.io`. Requests from any
  other origin (including `localhost` dev) get 403, so test on the deployed site.
- Rotate the token by generating a new one, replacing the secret, and revoking the old one.
