import { ApiError, json, withRecruiter } from "@/lib/api";
import {
  checkoutConfig,
  createStripeCheckout,
  reserveCheckout,
} from "@/lib/checkout";

export async function POST(request: Request) {
  return withRecruiter(request, async ({ recruiter }) => {
    const config = checkoutConfig();
    if (!config)
      throw new ApiError(
        503,
        "CHECKOUT_UNAVAILABLE",
        "Online upgrades are currently unavailable.",
      );
    return json({
      url: await createStripeCheckout(
        config,
        await reserveCheckout(recruiter.id),
      ),
    });
  });
}
