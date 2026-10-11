import { authResponse, isSameOrigin } from "@/lib/auth-response";
import { getRecruiter } from "@/lib/supabase/auth";
import { filterChips, validateFilters } from "@/lib/search/filters";

// Read-only UI preview. The assessment's /api/search will own model calls,
// atomic quota consumption and persisted result snapshots.
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return authResponse({ error: "Invalid request origin." }, 403);
  try {
    const context = await getRecruiter();
    if (!context)
      return authResponse(
        { error: "Sign in with a recruiter account to continue." },
        401,
      );
    const text = await request.text();
    if (text.length > 10000)
      return authResponse({ error: "Request is too large." }, 400);
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return authResponse({ error: "Invalid request." }, 400);
    const filters = validateFilters(body.filters);
    const page = body.page ?? 1;
    const sort = body.sort ?? "availability";
    if (
      !filters ||
      !filterChips(filters).length ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > 250 ||
      !["availability", "experience"].includes(sort)
    ) {
      return authResponse(
        { error: "Choose at least one valid filter to search." },
        400,
      );
    }
    let select =
      "*,experiences:candidate_experiences(*),education:candidate_education(*)";
    if (filters.companyType)
      select += ",background:candidate_experiences!inner(company_type)";
    if (filters.field) select += ",study:candidate_education!inner(field)";
    let query = context.supabase
      .from("candidates")
      .select(select, { count: "exact" });
    if (filters.role) query = query.eq("role", filters.role);
    if (filters.seniority) query = query.eq("seniority", filters.seniority);
    if (filters.skills.length) query = query.contains("skills", filters.skills);
    if (filters.minYears !== undefined)
      query = query.gte("years_experience", filters.minYears);
    if (filters.city) query = query.eq("city", filters.city);
    if (filters.state) query = query.eq("state", filters.state);
    if (filters.openToWork) query = query.eq("open_to_work", true);
    if (filters.companyType)
      query = query.eq("background.company_type", filters.companyType);
    if (filters.field) query = query.eq("study.field", filters.field);
    if (sort === "availability")
      query = query.order("open_to_work", { ascending: false });
    query = query.order("years_experience", { ascending: false }).order("id");
    const { data, count, error } = await query.range(
      (page - 1) * 20,
      page * 20 - 1,
    );
    if (error) throw new Error("Query failed");
    return authResponse({ results: data, total: count ?? 0 });
  } catch (error) {
    if (error instanceof SyntaxError)
      return authResponse({ error: "Invalid request." }, 400);
    return authResponse(
      { error: "Couldn't load candidates. Please try again." },
      500,
    );
  }
}
