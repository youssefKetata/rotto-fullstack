import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createStripeCheckout } from "../../src/lib/checkout";
import {
  verifyStripeSignature,
  validBillingEvent,
} from "../../src/lib/billing";

test("Stripe verification signs exact archived bytes and accepts any matching v1", () => {
  const body =
    '{"id":"evt_test","created":1,"type":"customer.subscription.created"}';
  const secret = "whsec_unit_test_only";
  const hash = createHmac("sha256", secret).update(`1.${body}`).digest("hex");
  assert.equal(
    verifyStripeSignature(body, `t=1,v1=${hash}`, secret, 301),
    true,
  );
  assert.equal(
    verifyStripeSignature(body, `t=1,v1=${hash}`, secret, 302),
    false,
  );
  assert.equal(
    verifyStripeSignature(body, `t=1,v1=${"0".repeat(64)},v1=${hash}`, secret),
    true,
  );
  assert.equal(
    verifyStripeSignature(`${body}\n`, `t=1,v1=${hash}`, secret),
    false,
  );
  assert.equal(
    verifyStripeSignature(body, `t=1,v1=${hash}`, "different"),
    false,
  );
  for (const bad of [
    null,
    "t=1,v1=oops",
    `t=1,t=2,v1=${hash}`,
    `t=abc,v1=${hash}`,
  ]) {
    assert.equal(verifyStripeSignature(body, bad, secret), false);
  }
});

test("Stripe Checkout binds a recurring price and workspace to the reserved attempt", async () => {
  const config = {
    key: "sk_test_example",
    price: "price_example",
    origin: "https://rotto.example.test",
    live: false,
  };
  const reservation = {
    company_id: "company-a",
    attempt_id: "attempt-a",
    expires_at: new Date("2026-11-25T12:00:00Z"),
  };
  const seen: string[] = [];
  const send: typeof fetch = async (url, options) => {
    assert.equal(url, "https://api.stripe.com/v1/checkout/sessions");
    assert.equal(options?.method, "POST");
    seen.push(new Headers(options.headers).get("Idempotency-Key") ?? "");
    const form = options.body as URLSearchParams;
    assert.equal(form.get("mode"), "subscription");
    assert.equal(form.get("line_items[0][price]"), "price_example");
    assert.equal(
      form.get("subscription_data[metadata][rotto_company_id]"),
      "company-a",
    );
    assert.equal(
      form.get("success_url"),
      "https://rotto.example.test/billing/return?checkout=complete",
    );
    assert.equal(
      form.get("cancel_url"),
      "https://rotto.example.test/billing/return?checkout=canceled",
    );
    return Response.json({
      url: "https://checkout.stripe.com/c/pay/example",
      livemode: false,
    });
  };
  for (let retry = 0; retry < 2; retry++)
    assert.equal(
      await createStripeCheckout(config, reservation, send),
      "https://checkout.stripe.com/c/pay/example",
    );
  assert.deepEqual(seen, [
    "rotto-checkout-attempt-a",
    "rotto-checkout-attempt-a",
  ]);
  for (const response of [
    Response.json({
      url: "https://other.example.test/checkout",
      livemode: false,
    }),
    Response.json({
      url: "https://checkout.stripe.com/c/pay/example",
      livemode: true,
    }),
    new Response(null, { status: 500 }),
  ]) {
    await assert.rejects(
      createStripeCheckout(config, reservation, async () => response),
      { code: "CHECKOUT_UNAVAILABLE" },
    );
  }
  await assert.rejects(
    createStripeCheckout(
      config,
      reservation,
      async () => new Response(null, { status: 409 }),
    ),
    { code: "CHECKOUT_IN_PROGRESS" },
  );
});

test("signed event metadata must be bounded and well typed", () => {
  assert.equal(
    validBillingEvent({ id: "evt_1", type: "unsupported", created: 1 }),
    true,
  );
  for (const event of [
    null,
    [],
    {},
    { id: "evt_1", type: "x", created: "1" },
    { id: "evt_1", type: "x", created: -1 },
  ]) {
    assert.equal(validBillingEvent(event), false);
  }
});
