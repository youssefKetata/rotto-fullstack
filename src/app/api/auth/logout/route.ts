import { authResponse, isSameOrigin } from "@/lib/auth-response";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return authResponse({ error: "Request origin is not allowed." }, 403);
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error)
      return authResponse(
        { error: "Unable to sign out. Please try again." },
        503,
      );
    return authResponse({ ok: true });
  } catch {
    return authResponse(
      { error: "Unable to sign out. Please try again." },
      503,
    );
  }
}
