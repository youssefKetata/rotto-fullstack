import "server-only";

import { authResponse, isSameOrigin } from "./auth-response";
import { getRecruiter } from "./supabase/auth";
import { readRequestBytes, RequestBodyTooLargeError } from "./request-body";

export type RecruiterContext = NonNullable<
  Awaited<ReturnType<typeof getRecruiter>>
>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function json(body: object, status = 200) {
  return authResponse(body, status);
}

export async function readObject(
  request: Request,
  maxBytes = 32000,
): Promise<Record<string, unknown>> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  ) {
    throw new ApiError(415, "JSON_REQUIRED", "Send the request as JSON.");
  }
  if (!request.body)
    throw new ApiError(400, "INVALID_REQUEST", "Send a JSON object.");
  let bytes: Uint8Array;
  try {
    bytes = await readRequestBytes(request, maxBytes);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw new ApiError(413, "REQUEST_TOO_LARGE", "The request is too large.");
    }
    throw error;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Send valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "INVALID_REQUEST", "Send a JSON object.");
  }
  return body as Record<string, unknown>;
}

export function onlyKeys(body: Record<string, unknown>, keys: string[]) {
  if (Object.keys(body).some((key) => !keys.includes(key))) {
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "The request contains unsupported fields.",
    );
  }
}

export function briefValue(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 4000) {
    throw new ApiError(
      400,
      "INVALID_BRIEF",
      "Enter a brief between 1 and 4,000 characters.",
    );
  }
  return value.trim();
}

export function nameValue(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 100) {
    throw new ApiError(
      400,
      "INVALID_NAME",
      "Enter a name between 1 and 100 characters.",
    );
  }
  return value.trim();
}

export function uuidValue(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new ApiError(404, "NOT_FOUND", "This item was not found.");
  }
  return value;
}

export function apiError(error: unknown): Response {
  if (error instanceof ApiError)
    return json({ error: error.message, code: error.code }, error.status);
  return json(
    {
      error: "This request couldn't be completed. Please try again.",
      code: "UNAVAILABLE",
    },
    503,
  );
}

export async function withRecruiter(
  request: Request,
  action: (context: RecruiterContext) => Promise<Response>,
) {
  try {
    if (request.method !== "GET" && !isSameOrigin(request)) {
      throw new ApiError(
        403,
        "INVALID_ORIGIN",
        "This request origin is not allowed.",
      );
    }
    const context = await getRecruiter(request);
    if (!context)
      throw new ApiError(
        401,
        "RECRUITER_REQUIRED",
        "Sign in with a recruiter account to continue.",
      );
    return await action(context);
  } catch (error) {
    return apiError(error);
  }
}
