import "server-only";

export function authResponse(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin === null) return true;

  const url = new URL(request.url);
  // Next.js can use its internal hostname in request.url. The ingress proxy
  // must overwrite forwarded headers with the public host and protocol.
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0].trim() ??
    request.headers.get("host") ??
    url.host;
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
    url.protocol.slice(0, -1);
  if (protocol !== "http" && protocol !== "https") return false;

  try {
    return origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}
