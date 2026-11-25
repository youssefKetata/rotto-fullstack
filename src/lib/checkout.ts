import "server-only";

import { ApiError } from "@/lib/api";
import { getDatabase } from "@/lib/database";

type CheckoutConfig = {
  key: string;
  price: string;
  origin: string;
  live: boolean;
};
type Reservation = { company_id: string; attempt_id: string; expires_at: Date };

export function stripeWebhookMode() {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  return /^(sk|rk)_(test|live)_/.test(key)
    ? { live: /^(sk|rk)_live_/.test(key) }
    : null;
}

export function checkoutConfig(): CheckoutConfig | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  const price = process.env.STRIPE_PRICE_ID?.trim();
  const origin = process.env.ROTTO_BILLING_ORIGIN?.trim();
  const webhook = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (
    !key ||
    !/^(sk|rk)_(test|live)_/.test(key) ||
    !price ||
    !/^price_[A-Za-z0-9]+$/.test(price) ||
    !origin ||
    !URL.canParse(origin) ||
    !webhook?.startsWith("whsec_") ||
    webhook === "whsec_rotto_assessment_sample"
  )
    return null;
  const live = /^(sk|rk)_live_/.test(key);
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    (url.protocol !== "https:" &&
      (live ||
        url.protocol !== "http:" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  )
    return null;
  return { key, price, origin, live };
}

export async function reserveCheckout(
  recruiterId: string,
): Promise<Reservation> {
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
  if (!reservation)
    throw new ApiError(
      409,
      "CHECKOUT_NOT_AVAILABLE",
      "This workspace already has a subscription or is no longer available.",
    );
  if (reservation.expires_at.getTime() <= Date.now())
    throw new ApiError(
      409,
      "CHECKOUT_EXPIRING",
      "The previous checkout is expiring. Try again in two minutes.",
    );
  return reservation;
}

export async function createStripeCheckout(
  config: CheckoutConfig,
  reservation: Reservation,
  send = fetch,
) {
  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": config.price,
    "line_items[0][quantity]": "1",
    "payment_method_types[0]": "card",
    "subscription_data[metadata][rotto_company_id]": reservation.company_id,
    client_reference_id: reservation.company_id,
    expires_at: String(Math.floor(reservation.expires_at.getTime() / 1000)),
    success_url: `${config.origin}/billing/return?checkout=complete`,
    cancel_url: `${config.origin}/billing/return?checkout=canceled`,
  });
  try {
    const response = await send("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `rotto-checkout-${reservation.attempt_id}`,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const session: { url?: unknown; livemode?: unknown } =
        await response.json();
      if (session.livemode === config.live && typeof session.url === "string") {
        const url = new URL(session.url);
        if (
          url.origin === "https://checkout.stripe.com" &&
          !url.username &&
          !url.password
        )
          return url.href;
      }
    } else if (response.status === 409) {
      throw new ApiError(
        409,
        "CHECKOUT_IN_PROGRESS",
        "Checkout is already starting. Please try again in a moment.",
      );
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
  }
  throw new ApiError(
    503,
    "CHECKOUT_UNAVAILABLE",
    "Couldn’t open Stripe Checkout. Please try again.",
  );
}
