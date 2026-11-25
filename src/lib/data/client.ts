import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type UserDataClient = SupabaseClient<Database>;
export type RecruiterMembership = Pick<
  Database["public"]["Tables"]["recruiters"]["Row"],
  "id" | "company_id"
>;
