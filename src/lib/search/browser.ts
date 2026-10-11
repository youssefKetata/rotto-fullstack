import { createClient } from "@/lib/supabase/client";

export class SearchApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SearchApiError";
  }
}

/** The API verifies this token; browser session state is only its transport. */
export async function searchApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { data, error } = await createClient().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new SearchApiError(
      "Your session has ended. Sign in again to continue.",
      401,
    );
  }
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...options,
    headers,
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Something went wrong. Please try again.";
    throw new SearchApiError(message, response.status);
  }
  if (body === null)
    throw new SearchApiError(
      "The server returned an invalid response. Please try again.",
      502,
    );

  return body as T;
}
