import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";
import { createClient } from "./server";

type Recruiter = { id: string; company_id: string };

// Pass a Request for Bearer-only API auth; omit it for cookie-based pages/actions.
export async function getRecruiter(request?: Request) {
  let token: string | undefined;
  if (request) {
    token = /^Bearer ([^\s]+)$/i.exec(
      request.headers.get("authorization") ?? "",
    )?.[1];
    if (!token) return null;
  }

  const { url, key } = getSupabaseConfig();
  const supabase = token
    ? createSupabaseClient(url, key, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : await createClient();

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user || data.user.role !== "authenticated") {
    return null;
  }

  const { data: recruiter, error: membershipError } = await supabase
    .from("recruiters")
    .select("id, company_id")
    .eq("id", data.user.id)
    .maybeSingle<Recruiter>();

  if (membershipError) throw new Error("Unable to load recruiter membership.");
  if (!recruiter) return null;

  return { supabase, recruiter };
}
