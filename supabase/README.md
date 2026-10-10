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
printing secret keys. Set `CANDIDATES_PATH` to use a different input file. Keep
the JSON files Git-ignored. Rerunning refreshes supplied candidate profiles and
histories, preserves their IDs, and does not reset usage, billing, or shortlists.
The database import is transactional; Auth account creation is a separate API
operation and can be recovered by rerunning the seed.

`supabase/seed.sql` supplies companies and initial usage during fresh startup or
database reset. Run `npm run db:seed` afterward for Auth accounts and candidates.

## Verification and next steps

Run `npm run test:db` with Node 24. Tests apply the actual migrations to embedded
Postgres (PGlite), with minimal stand-ins for Supabase's auth table/function and
roles. They verify company isolation, permissions, company-owned writes, seed
reruns, and import rollback without Docker. They do not exercise Supabase Auth,
PostgREST, or concurrent quota/webhook processing.

The migration has also been applied to local Supabase. Atomic quota/billing
functions remain separate next steps; their workflows are not implemented by
this schema alone.
