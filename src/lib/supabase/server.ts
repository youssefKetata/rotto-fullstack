import type { Database } from "@/lib/supabase/types";
import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { io } from "next/cache";
import { getSupabaseConfig } from "./config";

export async function createClient() {
  // Auth initialization reads the clock, so exclude it from prerendering.
  await io();
  const cookieStore = await cookies();
  const { url, key } = getSupabaseConfig();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies; Proxy handles refreshes.
        }
      },
    },
  });
}
