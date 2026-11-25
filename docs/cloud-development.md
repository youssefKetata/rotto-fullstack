# Cloud development

Node, Next.js, Docker and the development Supabase stack run in GitHub
Codespaces. The laptop only needs an editor/browser and GitHub CLI for private
network tunnels. Render and the hosted Rotto database are not development targets.

## Open the environment

Create a Codespace from the development branch of
`youssefKetata/rotto-fullstack`, using `.devcontainer/devcontainer.json` and the
2-core / 8 GB machine. Initial creation installs Node 24 and Docker, applies
the repository migrations, imports the 5,000 candidates and creates the two demo
accounts. The development server starts automatically, including after a restart.

On your laptop, authenticate GitHub CLI with the `codespace` permission, then run:

```sh
gh codespace list --repo youssefKetata/rotto-fullstack
gh codespace ports forward 3000:3000 54321:54321 54323:54323 --codespace CODESPACE_NAME
```

Keep that lightweight tunnel process running and open <http://localhost:3000>.
Studio is at <http://localhost:54323>. Both the browser and cloud server can then
use the same `127.0.0.1:54321` Supabase URL. This avoids exposing the Supabase
gateway publicly or changing application authentication to accommodate preview URLs.
Keep forwarded ports private; do not forward Postgres port 54322.

Login: `recruiter@acme.test` or `recruiter@globex.test`, password
`rotto-assessment`. These accounts and their data are separate from the live site.

## Secrets

Local connection values are generated inside the Codespace in ignored `.env.local`.
The webhook fixture secret is supplied automatically. No production database URL,
Supabase admin key or Render credential is required.

New natural-language searches require `GEMINI_API_KEY`. Add it as a Codespaces
secret restricted to this repository before creating the environment, or edit
`.env.local` inside the Codespace and restart Next.js. Never commit it. The cloud
checks do not need a real provider key and do not make live Gemini calls.

## Work and verify

Edit in the Codespace's browser editor or attach VS Code. From its terminal:

```sh
npm run check:cloud
```

This runs lint, TypeScript, formatting, unit and database tests, builds the app,
and tests login and APIs against a production server on port 3100. Tests only
accept the Codespace's loopback Supabase URLs. The development server on port
3000 can remain running: Next.js 16 uses separate development and production
output directories.

Push commits to the development branch to run the same checks on a fresh
GitHub-hosted runner. Every workflow run creates a separate disposable database;
no production secrets are used. Failed server logs are retained for three days.
Render continues deploying `codex/deploy-render` until changes are deliberately
promoted. Do not push development changes to that branch.

## Stop when finished

```sh
gh codespace stop --codespace CODESPACE_NAME
```

The environment is created with a short idle timeout and retention period.
Stopped Codespaces still use storage. Commit and push work before deleting one.
GitHub's included compute/storage allowance is limited; keep paid overages
disabled in your GitHub billing settings. Never enable a paid budget just to
continue this workflow.
