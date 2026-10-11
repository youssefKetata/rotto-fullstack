# Database foundation

`migrations/` is the schema source of truth. Supabase applies files in timestamp
order. The initial migration creates 13 application tables, constraints, indexes,
explicit role grants, and row-level security (RLS).

## Structure

- **Accounts:** `public.companies` and `public.recruiters`. Recruiter IDs reference
  Supabase's existing `auth.users` IDs. Company slugs resolve Stripe metadata.
- **Shared data:** `public.candidates`, `public.candidate_experiences`, and
  `public.candidate_education`. Candidate IDs preserve the supplied text IDs.
  Skills are an indexed array; history positions preserve input order.
- **Company data:** `public.shortlists`, `public.shortlist_people`,
  `public.saved_briefs`, `public.searches`, and `public.search_results`.
  A result snapshot stores unique candidate IDs and one-based positions.
- **Operations:** `private.company_usage`, `private.billing_events`, and
  `private.subscriptions`. A company is paid when it has an active subscription;
  there is no second plan field to synchronize.

Only role/seniority, location, and skills have explicit search indexes. Primary
keys and unique constraints supply the other indexes. Add more after measuring
the actual queries.

## Access

Anonymous callers have no application table privileges. Recruiters can read
shared candidates, read their own company records, manage their company's
shortlists, and create/delete saved briefs. Ownership and audit fields use
trusted defaults and are excluded from client write grants. Search records and
result snapshots are writable only by the server.

RLS resolves membership through `private.current_company_id()`, a narrowly
scoped security-definer function with an empty search path. It derives the user
from `auth.uid()` and accepts no caller-supplied company or user ID. It avoids
recursive membership policies. Other private functions/tables have no recruiter
write access. The private schema is not included in the Data API configuration;
schema usage only lets policies/defaults execute this helper.

The service role has administrative access and bypasses RLS. Its key must remain
server-side. Future migrations must explicitly grant only necessary privileges,
enable RLS, and revoke default `PUBLIC` execution on privileged functions.

## Seed

Local Supabase keeps the database, Auth, REST API, gateway, and Studio enabled.
Analytics/log collection, Realtime, Storage, Edge Functions, and email testing
are disabled to reduce memory use. The assessment uses confirmed password
accounts and Next.js API routes.

Start local Supabase, then run `npm run db:seed`. It loads `data/candidates.json`,
creates Acme and Globex and their initial usage rows, and creates confirmed Auth
accounts through the admin API:

Global signup is disabled; the email provider remains enabled for password login.

| Company | Email                 | Password         |
| ------- | --------------------- | ---------------- |
| Acme    | recruiter@acme.test   | rotto-assessment |
| Globex  | recruiter@globex.test | rotto-assessment |

The script obtains local connection details from the pinned Supabase CLI without
printing secret keys. Set `CANDIDATES_PATH` to use a different input file. The
supplied candidate dataset and reference-query test fixture are included in Git. Rerunning refreshes profiles and
histories, preserves their IDs, and does not reset usage, billing, or shortlists.
The database import is transactional; Auth account creation is a separate API
operation and can be recovered by rerunning the seed.

`supabase/seed.sql` supplies companies and initial usage during fresh startup or
database reset. Run `npm run db:seed` afterward for Auth accounts and candidates.

## Next.js connection

`src/lib/supabase/client.ts` creates the browser client. `server.ts` creates a
fresh cookie client for each Server Component, Server Action, or Route Handler.
Both use only `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, written by `make setup`. Configuration is
checked when creating a client, so missing settings give a useful error without
printing values. `DATABASE_URL` is used by the server-only Postgres pool for
search/quota and webhook transactions, as well as local seed and integration tests.
`SUPABASE_SECRET_KEY` is used by local account setup and integration fixtures.
Recruiter IDs are verified through Auth before privileged search operations;
the transaction resolves and locks their database membership and company usage.

`src/proxy.ts` refreshes cookie sessions and forwards updated cookies to both the
server render and browser. Session responses use `Cache-Control: private, no-store`.
It skips static assets, the billing webhook, and requests with Authorization headers.
Proxy redirects guests from `/` to `/login` and signed-in users from `/login` to
`/`, preserving refreshed cookies on redirects. It checks the session only;
protected pages and API handlers still verify recruiter access close to the data.

Use `getRecruiter()` from `src/lib/supabase/auth.ts` in protected server UI or
actions. It returns `{ supabase, recruiter }`, or `null` when unauthenticated or
without recruiter membership. Identity is checked with `auth.getUser()` against
Auth, and `recruiter.company_id` is loaded under RLS, never taken from user input.
Use the returned client for company data so RLS stays in force.

For API handlers, call `getRecruiter(request)`: this requires
`Authorization: Bearer <Supabase access token>` and never falls back to cookies.
Return 401 for `null`; membership query failures throw. Each token client is
request-local, with session persistence and automatic refresh disabled.
Never use `auth.getSession()`'s embedded user as server authorization.

With the current `cacheComponents` configuration, protected server UI that reads
cookies belongs inside a Suspense boundary. Keep authentication and company data
out of shared caches. Cookie-writing auth actions/routes must return uncached
responses. Email/password login needs no OAuth callback route.

`POST /api/auth/login` accepts JSON `{ email, password }`, checks recruiter
membership, and sets session cookies without returning tokens. `POST
/api/auth/logout` signs out only the current session. Both reject cross-origin
browser requests and return uncached JSON. `/login` renders a static form without
a session-loading placeholder. The home page verifies recruiter access and
displays their company under RLS. Signed-in users without recruiter access see
an access message and can sign out, instead of looping between pages.
There are no signup or password-reset flows.

Origin validation uses `Host`, or the first `X-Forwarded-Host` and
`X-Forwarded-Proto` values when deployed behind a reverse proxy. The ingress
proxy must overwrite these headers with the public host and protocol rather
than pass through client-supplied values. This supports HTTPS termination and
public hostnames even when Next.js constructs an internal `request.url`.

Reference: [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/nextjs).

## Verification and next steps

Run `npm run test:connection` after `make setup`, with local Supabase running.
It checks both recruiter tokens, RLS identity, rejected credentials, and cookie
refresh forwarding. These tests sign in and refresh sessions but do not change
application data.

Run `npm run test:db` with Node 24 after `make setup`, with local Supabase running.
Schema/RLS tests apply real migrations to embedded Postgres (PGlite).
Server transaction tests use disposable identities in local Postgres and cover
quota, rollback, ownership, same-record predicates, exact reference sets,
ordered snapshots, and simultaneous admission/completion. Seeded company data is preserved.

`20261011160000_search_execution.sql` adds only a private attempt ledger and index.
`20261011180000_remove_business_functions.sql` removes previously installed search
and billing RPCs. The former uncommitted billing migration was reverted locally.
Search admission, completion, failure recovery and matching now live in
`src/lib/search/database.ts` and `query.ts`; subscription updates live in
`src/lib/billing.ts`. They use short Postgres transactions and the same company
lock. Gemini runs between transactions. Expired attempts release reservations;
replayed request keys return the completed snapshot. Billing events deduplicate
by ID and apply newer state, with cancellation winning equal-second ties.

`npm run test:api` uses disposable companies and actual Bearer requests through
Next.js and PostgREST. It checks direct-token isolation, named shortlist writes,
saved briefs, every result page, free usage, signed event ordering and cancellation.
Set `ROTTO_TEST_BASE_URL` to test a production server on another local port.
`ROTTO_LIVE_GEMINI=1` additionally enables one free-tier end-to-end model request.
