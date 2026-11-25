import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { recordBillingEvent } from "@/lib/data/billing";
import { workspaceForRecruiter } from "@/lib/data/workspaces";

export function demoUpgradeEnabled() {
  if (
    process.env.ROTTO_DEMO_UPGRADE !== "1" &&
    process.env.CODESPACES !== "true"
  )
    return false;
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  return [process.env.DATABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].every(
    (value) =>
      value && URL.canParse(value) && loopback.has(new URL(value).hostname),
  );
}

export async function activateDemoPlan(recruiterId: string) {
  const company = await workspaceForRecruiter(recruiterId);
  if (!company) return false;
  const subscription = `rotto-demo-${company.id}`;
  await applyBillingEvent({
    id: subscription,
    type: "customer.subscription.created",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: subscription,
        status: "active",
        metadata: { company: company.slug },
      },
    },
  });
  return true;
}

export type BillingEvent = {
  id: string;
  type: string;
  created: number;
  data?: unknown;
  livemode?: unknown;
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
  now?: number,
): boolean {
  if (!signature || signature.length > 2048 || !secret) return false;
  const pieces = signature.split(",").map((entry) => entry.trim().split("="));
  const timestamps = pieces
    .filter(([key]) => key === "t")
    .map(([, value]) => value);
  if (timestamps.length !== 1 || !/^\d{1,16}$/.test(timestamps[0]))
    return false;
  if (now !== undefined && Math.abs(now - Number(timestamps[0])) > 300)
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

export async function applyBillingEvent(
  event: BillingEvent,
  stripeMode?: { live: boolean },
) {
  const data = objectValue(event.data);
  const object = objectValue(data?.object);
  const metadata = objectValue(object?.metadata);
  const subscription = object?.id;
  const slug = metadata?.company;
  const companyId = metadata?.rotto_company_id;
  const status = object?.status;
  const verifiedStripeCompany =
    stripeMode &&
    event.livemode === stripeMode.live &&
    object?.object === "subscription" &&
    typeof companyId === "string" &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(companyId)
      ? companyId
      : null;
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
    (stripeMode
      ? verifiedStripeCompany !== null &&
        /^sub_[A-Za-z0-9]+$/.test(subscription)
      : typeof slug === "string")
  ) {
    const workspace = verifiedStripeCompany
      ? { id: verifiedStripeCompany }
      : { slug: String(slug) };
    const nextStatus =
      event.type === "customer.subscription.deleted" ? "canceled" : status;
    await recordBillingEvent(event, {
      workspace,
      subscription,
      status: nextStatus,
    });
    return;
  }
  await recordBillingEvent(event);
}
