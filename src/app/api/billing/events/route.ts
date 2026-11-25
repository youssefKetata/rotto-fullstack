import { json } from "@/lib/api";
import { stripeWebhookMode } from "@/lib/checkout";
import { readRequestBytes, RequestBodyTooLargeError } from "@/lib/request-body";
import {
  applyBillingEvent,
  validBillingEvent,
  verifyStripeSignature,
} from "@/lib/billing";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = stripeWebhookMode();
  if (!secret || (stripe && secret === "whsec_rotto_assessment_sample"))
    return json(
      { error: "Billing is not configured.", code: "BILLING_CONFIGURATION" },
      503,
    );
  // Keep the signed bytes unchanged. Do not parse/re-serialize before checking.
  let raw: Uint8Array;
  try {
    raw = await readRequestBytes(request, 100000);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json(
        { error: "Invalid Stripe signature.", code: "BAD_SIGNATURE" },
        400,
      );
    }
    return json(
      {
        error: "Billing is unavailable. Please retry.",
        code: "BILLING_UNAVAILABLE",
      },
      503,
    );
  }
  if (
    !verifyStripeSignature(
      raw,
      request.headers.get("stripe-signature"),
      secret,
      stripe ? Math.floor(Date.now() / 1000) : undefined,
    )
  ) {
    return json(
      { error: "Invalid Stripe signature.", code: "BAD_SIGNATURE" },
      400,
    );
  }
  let event: unknown;
  try {
    event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    return json({ received: true });
  }
  if (!validBillingEvent(event)) return json({ received: true });
  if (stripe && event.livemode !== stripe.live) return json({ received: true });
  try {
    await applyBillingEvent(event, stripe ?? undefined);
  } catch {
    return json(
      {
        error: "Billing is unavailable. Please retry.",
        code: "BILLING_UNAVAILABLE",
      },
      503,
    );
  }
  return json({ received: true });
}
