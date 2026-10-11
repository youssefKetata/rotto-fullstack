# Rotto assessment

Requires Node 24, npm, Make, and Docker Desktop running with `docker` on PATH.
Supabase CLI 2.119.0 is installed from the lockfile; no global CLI is needed.

The supplied candidate dataset is included at `data/candidates.json` so a fresh
clone needs no data-copying step. To override it, put `candidates.json` in the
repository root or set `CANDIDATES_PATH` to another file. Other assessment files
and override datasets remain Git-ignored.

```sh
make setup
make dev
```

Setup installs locked dependencies, starts local Supabase, applies pending
migrations, loads all candidates, and creates both recruiters. It generates
Git-ignored `.env.local` with the local URL, publishable key, server secret key,
and database URL, preserving unrelated settings. Repeating setup preserves
existing searches, shortlists, billing, and consumed free searches.

The app runs at http://localhost:3000. Studio runs at http://127.0.0.1:54323.
Sign in as `recruiter@acme.test` or `recruiter@globex.test`, both with password
`rotto-assessment`. The login page is at `/login`; signing in opens a protected
company workspace with sign-out. Search and the assessment data APIs are next.

The model provider key and `STRIPE_WEBHOOK_SECRET` must come from environment
variables (or `.env.local`); setup does not invent values for them.

Checks: `npm run lint`, `npm run test:db`, and `npm run test:connection`
(the latter needs local Supabase running after setup).
`npm run test:auth-unit` checks origin validation without running services.
With `make dev` running, `npm run test:auth` checks login/logout, Proxy redirects,
and recruiter access. It creates and removes a temporary local Auth account to
check the missing-membership case.
Database details: [supabase/README.md](supabase/README.md).
