import { createHmac, randomUUID } from "node:crypto";

const company = process.argv[2];
if (!["acme", "globex"].includes(company)) {
  console.error(
    "Usage: node --env-file=.env.local scripts/activate-demo-plan.mjs acme|globex",
  );
  process.exitCode = 1;
} else {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret?.trim())
      throw new Error(
        "Set STRIPE_WEBHOOK_SECRET in .env.local to match the running app.",
      );
    const base = new URL(
      process.env.ROTTO_TEST_BASE_URL ?? "http://localhost:3000",
    );
    if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
      throw new Error("Demo activation requires a local app URL.");
    }
    const created = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: `evt_demo_${randomUUID()}`,
      type: "customer.subscription.updated",
      created,
      data: {
        object: {
          id: `sub_local_demo_${company}`,
          status: "active",
          metadata: { company },
        },
      },
    });
    const signature = createHmac("sha256", secret)
      .update(`${created}.${payload}`)
      .digest("hex");
    const response = await fetch(new URL("/api/billing/events", base), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": `t=${created},v1=${signature}`,
      },
      body: payload,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `Webhook returned HTTP ${response.status}. Check the app and its webhook secret.`,
      );
    console.log(
      `Activation event accepted for ${company}. Click “Check plan” in the app to confirm paid access.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
