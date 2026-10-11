import { authResponse, isSameOrigin } from "@/lib/auth-response";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return authResponse({ error: "Request origin is not allowed." }, 403);
  }
  if (
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  ) {
    return authResponse({ error: "Send email and password as JSON." }, 415);
  }
  let credentials: unknown;
  try {
    const body = await request.text();
    if (body.length > 4096)
      return authResponse({ error: "Request is too large." }, 413);
    credentials = JSON.parse(body);
  } catch {
    return authResponse({ error: "Invalid JSON." }, 400);
  }
  if (
    !credentials ||
    typeof credentials !== "object" ||
    Array.isArray(credentials)
  ) {
    return authResponse({ error: "Enter your email and password." }, 400);
  }
  const { email, password } = credentials as Record<string, unknown>;
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > 256
  ) {
    return authResponse({ error: "Enter a valid email and password." }, 400);
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data.user) {
      if (error?.status === 429) {
        return authResponse(
          { error: "Too many attempts. Please try again later." },
          429,
        );
      }
      if (error && (!error.status || error.status >= 500)) {
        return authResponse(
          { error: "Sign-in is unavailable. Please try again." },
          503,
        );
      }
      return authResponse({ error: "Email or password is incorrect." }, 401);
    }
    const membership = await supabase
      .from("recruiters")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();
    if (membership.error || !membership.data) {
      await supabase.auth.signOut({ scope: "local" });
      return authResponse(
        {
          error: membership.error
            ? "Sign-in is unavailable. Please try again."
            : "This account does not have recruiter access.",
        },
        membership.error ? 503 : 403,
      );
    }
    return authResponse({ ok: true });
  } catch {
    return authResponse(
      { error: "Sign-in is unavailable. Please try again." },
      503,
    );
  }
}
