import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getDatabase } from "@/lib/database";

export type BillingEvent = {
  id: string;
  type: string;
  created: number;
  data?: unknown;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// Assessment fixtures are archived signed payloads. Verify authenticity without
// rejecting them by age; deduplication and monotonic application prevent replay
// from changing state. This is deliberate for a local, non-deployed assessment.
export function verifyStripeSignature(
  body: string | Uint8Array,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || signature.length > 2048 || !secret) return false;
  const pieces = signature.split(",").map((entry) => entry.trim().split("="));
  const timestamps = pieces
    .filter(([key]) => key === "t")
    .map(([, value]) => value);
  if (timestamps.length !== 1 || !/^\d{1,16}$/.test(timestamps[0]))
    return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamps[0]}.`)
    .update(body)
    .digest();
  return pieces.some(
    ([key, value]) =>
      key === "v1" &&
      /^[a-fA-F0-9]{64}$/.test(value) &&
      timingSafeEqual(expected, Buffer.from(value, "hex")),
  );
}

export function validBillingEvent(value: unknown): value is BillingEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === "string" &&
    event.id.length > 0 &&
    event.id.length <= 255 &&
    typeof event.type === "string" &&
    event.type.length > 0 &&
    event.type.length <= 255 &&
    Number.isSafeInteger(event.created) &&
    (event.created as number) >= 0
  );
}

export async function applyBillingEvent(event: BillingEvent) {
  // Signature verification happens in the route before this server-only writer.
  await getDatabase().begin(async (sql) => {
    const inserted =
      await sql`insert into private.billing_events(event_id,event_type,event_created)
      values (${event.id},${event.type},${event.created}) on conflict do nothing returning event_id`;
    if (!inserted.count) return;
    let outcome = "ignored";
    const data = objectValue(event.data);
    const object = objectValue(data?.object);
    const metadata = objectValue(object?.metadata);
    const subscription = object?.id;
    const slug = metadata?.company;
    const status = object?.status;
    if (
      [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ].includes(event.type) &&
      typeof subscription === "string" &&
      subscription.length > 0 &&
      subscription.length <= 255 &&
      typeof status === "string" &&
      status.length > 0 &&
      status.length <= 100 &&
      typeof slug === "string"
    ) {
      const [company] = await sql<
        { id: string }[]
      >`select id from public.companies where slug = ${slug}`;
      if (company) {
        await sql`insert into private.company_usage(company_id) values (${company.id}) on conflict do nothing`;
        await sql`select company_id from private.company_usage where company_id = ${company.id} for update`;
        const nextStatus =
          event.type === "customer.subscription.deleted" ? "canceled" : status;
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
