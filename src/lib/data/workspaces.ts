import "server-only";

import type { UserDataClient } from "./client";
import { getDatabase } from "./pool";

export function readRecruiterMembership(
  supabase: UserDataClient,
  userId: string,
) {
  return supabase
    .from("recruiters")
    .select("id, company_id")
    .eq("id", userId)
    .maybeSingle();
}

export async function readWorkspaceName(
  supabase: UserDataClient,
  companyId: string,
) {
  const { data, error } = await supabase
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .single();
  if (error) throw new Error("Unable to load workspace.", { cause: error });
  return data.name;
}

export async function workspaceForRecruiter(recruiterId: string) {
  const [company] = await getDatabase()<{ id: string; slug: string }[]>`
    select company.id, company.slug from public.recruiters recruiter
    join public.companies company on company.id = recruiter.company_id
    where recruiter.id = ${recruiterId}`;
  return company;
}
