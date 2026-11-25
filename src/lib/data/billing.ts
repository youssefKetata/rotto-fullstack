import "server-only";

import { getDatabase } from "./pool";

type SubscriptionChange = {
  workspace: { id: string } | { slug: string };
  subscription: string;
  status: string;
};

export async function recordBillingEvent(
  event: { id: string; type: string; created: number },
  change?: SubscriptionChange,
) {
  await getDatabase().begin(async (sql) => {
    const inserted =
      await sql`insert into private.billing_events(event_id,event_type,event_created)
      values (${event.id},${event.type},${event.created}) on conflict do nothing returning event_id`;
    if (!inserted.count) return;
    let outcome = "ignored";
    if (change) {
      const { workspace, subscription, status: nextStatus } = change;
      const [company] =
        "id" in workspace
          ? await sql<
              { id: string }[]
            >`select id from public.companies where id = ${workspace.id}`
          : await sql<
              { id: string }[]
            >`select id from public.companies where slug = ${workspace.slug}`;
      if (company) {
        await sql`insert into private.company_usage(company_id) values (${company.id}) on conflict do nothing`;
        await sql`select company_id from private.company_usage where company_id = ${company.id} for update`;
        const changed =
          await sql`insert into private.subscriptions(stripe_subscription_id,company_id,status,last_event_created,last_event_id)
          values (${subscription},${company.id},${nextStatus},${event.created},${event.id})
          on conflict (stripe_subscription_id) do update set status = excluded.status,
            last_event_created = excluded.last_event_created, last_event_id = excluded.last_event_id
          where private.subscriptions.company_id = excluded.company_id
            and (excluded.last_event_created > private.subscriptions.last_event_created
              or (excluded.last_event_created = private.subscriptions.last_event_created
                and excluded.status = 'canceled' and private.subscriptions.status <> 'canceled'))`;
        if (changed.count) outcome = "applied";
      }
    }
    await sql`update private.billing_events set outcome = ${outcome}, processed_at = now() where event_id = ${event.id}`;
  });
}
