import { json } from "@/lib/api";
import { readRequestBytes, RequestBodyTooLargeError } from "@/lib/request-body";
import {
  applyBillingEvent,
  validBillingEvent,
  verifyStripeSignature,
} from "@/lib/billing";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret)
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
    !verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret)
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
  try {
    await applyBillingEvent(event);
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
