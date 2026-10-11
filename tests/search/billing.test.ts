import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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
