# Rotto assessment

Use Node 24, npm, Make and Docker Desktop. Supabase **2.119.0** and Next.js
**16.4.0** are locked; no global CLI is needed.

```sh
make setup
make dev
```

Setup starts Supabase, applies migrations, imports
5,000 candidates, and creates `recruiter@acme.test` and
`recruiter@globex.test` (password: `rotto-assessment`). Open
[localhost:3000](http://localhost:3000). Repeating setup preserves searches,
shortlists, billing and consumed allowance. It preserves provider settings in
ignored `.env.local`; supply `GEMINI_API_KEY` and `STRIPE_WEBHOOK_SECRET` through
the environment or that file. The supplied webhook fixture secret is
`whsec_rotto_assessment_sample`. No Stripe account or checkout is needed.

Search uses one direct request to free-tier **Gemini 3.5 Flash-Lite**, with no
retries or paid fallback. Interpretation has a 15-second deadline to allow for
first-connection setup and provider latency; the search reservation lasts 30
seconds so completion can finish within its lease. Only the brief, distinct
database vocabulary and interpretation rules go to Google. Candidate profiles
stay in Postgres. Gemini returns JSON; strict server validation accepts only
known fields, canonical values, bounded ranges and consistent criteria. The
prompt and a second guard report unsupported requirements explicitly. A required
unverifiable condition gives zero verified matches. The model never writes SQL.

SQL applies AND within each group, OR between groups, exclusions, same-record
work/education conditions, and optional preferences. Preferences rank first,
then experience and candidate ID. Every match is stored with a stable position;
20-result pages read that snapshot. The UI displays all criteria and issues,
stages edits, and persists named company shortlists and saved briefs.

**Structure:** Search components render the workspace; dedicated hooks own
actions, shortlists and session restoration. `src/lib/search` holds shared
contracts, interpretation, parameterized SQL and transaction services. A server-only
Postgres pool uses `DATABASE_URL`; business logic lives in TypeScript. Supabase
clients use generated types; regenerate after migrations with `npm run db:types`.

Company locks, attempt leases and idempotency keys enforce one lifetime free
search, including concurrent requests, refinements and saved-brief reruns.
Completed zero-result searches count; technical failures release the allowance.
Paging, reloads, profiles and saving do not count. Bearer APIs verify the user
with Supabase Auth; RLS protects company records even through direct Supabase
calls. Privileged writes and secrets remain server-only. Webhooks verify raw
bytes, deduplicate event IDs, and apply only newer subscription events.

**Cost:** $0 per search on the configured free tier while its quota is available.
Billing stays disabled; provider limits yield an error and restore allowance.
[Model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).

**Validation:** `npm run lint`, `npm run typecheck`, `npm run format:check`,
`npm run build`, `npm run test:http`, `npm run test:db`,
`npm run test:search-unit`, `npm run test:auth-unit`, `npm run test:connection`,
`npm run test:auth`, and `npm run test:api`. Service tests use disposable accounts;
seeded allowances are preserved. Opt-in live evaluation is
`ROTTO_LIVE_GEMINI=1 node --env-file=.env.local --conditions=react-server --import tsx tests/search/live.ts`.
Ten supplied briefs matched their exact expected sets in the prior live run.
A prior live search took 2.05 seconds. The latest production paging run
(234 pages) measured p50 116 ms and p95 181 ms.

**Tradeoffs:** JSON mode plus application validation avoids a provider rejection
of the larger output schema. Unsupported requirements conservatively block the
whole search. Archived fixture signatures have no age expiry; deduplication and
event ordering still apply. With another week: broader paraphrase/logic
evaluation, branch-specific unsupported conditions, webhook timestamp checks,
and broader latency measurements.
