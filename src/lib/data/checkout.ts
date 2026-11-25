import "server-only";

import { getDatabase } from "./pool";

export type Reservation = {
  company_id: string;
  attempt_id: string;
  expires_at: Date;
};

export async function reserveWorkspaceCheckout(recruiterId: string) {
  const sql = getDatabase();
  const [reservation] = await sql<Reservation[]>`
    insert into private.checkout_reservations (company_id, attempt_id, expires_at)
    select recruiter.company_id, gen_random_uuid(), date_trunc('second', now()) + interval '1 hour'
    from public.recruiters recruiter
    where recruiter.id = ${recruiterId} and not exists (
      select 1 from private.subscriptions
      where company_id = recruiter.company_id and status in ('active', 'trialing', 'past_due', 'unpaid', 'paused')
    )
    on conflict (company_id) do update set
      attempt_id = case when checkout_reservations.expires_at + interval '2 minutes' <= now()
        then excluded.attempt_id else checkout_reservations.attempt_id end,
      expires_at = case when checkout_reservations.expires_at + interval '2 minutes' <= now()
        then excluded.expires_at else checkout_reservations.expires_at end
    returning company_id, attempt_id, expires_at`;
  return reservation ?? null;
}
