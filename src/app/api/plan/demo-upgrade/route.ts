import { ApiError, json, withRecruiter } from "@/lib/api";
import { activateDemoPlan, demoUpgradeEnabled } from "@/lib/billing";
import { planFor } from "@/lib/search/service";

export async function POST(request: Request) {
  return withRecruiter(request, async (context) => {
    if (
      !demoUpgradeEnabled() ||
      !(await activateDemoPlan(context.recruiter.id))
    ) {
      throw new ApiError(404, "NOT_FOUND", "Demo upgrade is unavailable.");
    }
    return json(await planFor(context));
  });
}
