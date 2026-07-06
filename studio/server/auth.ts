// Studio auth (#506) — single admin token, cookie session for the browser.
//
// Scheme (recorded decision, see docker/README.md "Authentication"):
//   • One shared admin token via env STUDIO_AUTH_TOKEN. When set, EVERY route
//     (GET + mutating, WS upgrade, static files) requires it — the only
//     login-free routes are GET /api/health and POST /api/auth itself.
//   • Two ways to present it: `Authorization: Bearer <token>` (agents / curl)
//     or the `studio_auth` cookie (browsers). POST /api/auth {token} sets the
//     cookie (httpOnly, SameSite=Strict) so the UI can log in with a form.
//   • When STUDIO_AUTH_TOKEN is unset the server keeps the historical
//     localhost-dev behavior: no auth, bound to 127.0.0.1 only.
//
// Comparison is timing-safe (sha256-digest + timingSafeEqual, length-blind).
// The cookie carries the token itself — single-tenant self-hosted; run behind
// TLS (reverse proxy) when the dashboard leaves the LAN.

import crypto from "node:crypto";

export const AUTH_COOKIE = "studio_auth";

/** Session length for the browser cookie (30 days). */
const COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

/** Timing-safe string equality (hash first so lengths never short-circuit). */
export function safeEqual(a: string, b: string): boolean {
  const da = crypto.createHash("sha256").update(a).digest();
  const db = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(da, db);
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/** Does this request carry the admin token (Bearer header or session cookie)? */
export function isAuthorized(req: Request, token: string): boolean {
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return safeEqual(auth.slice("bearer ".length).trim(), token);
  }
  const cookie = cookieValue(req.headers.get("cookie"), AUTH_COOKIE);
  return cookie !== null && safeEqual(cookie, token);
}

/** The Set-Cookie header value for a successful login. */
export function authCookieHeader(token: string): string {
  return [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE_S}`,
  ].join("; ");
}
