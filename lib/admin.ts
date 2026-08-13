import "server-only";
import crypto from "node:crypto";
import {cookies} from "next/headers";
import {diagnosePasswordHashConfig, resolvePasswordHash, sign as signValue, timingSafeEqualStrings, verifyPassword as verifyPasswordHash} from "@/lib/auth-crypto";

const cookieName = "guia_admin";
const ttl = 60 * 60 * 8; // 8h, matches the token's own `exp` claim below
// path:"/" is required, not just permissive: the admin UI lives under /admin/*
// but its mutation endpoints live under /api/admin/* — a cookie scoped to
// /admin is never sent on fetch() calls to /api/admin/*, which previously
// made every admin form submission fail with UNAUTHORIZED regardless of
// login state. The two path spaces don't share a deeper common prefix, so
// "/" is the minimum path that covers both.
const cookiePath = "/";

function secret() {
  return process.env.ADMIN_SESSION_SECRET || "";
}

// Warn at most once per process — configured() is called on every request,
// and the diagnosis text never includes secret values, so it's safe to log,
// but repeating it on every request would just be noise.
let warnedAboutHashConfig = false;
export function configured() {
  const ok = Boolean(process.env.ADMIN_EMAIL && resolvePasswordHash() && secret());
  if (!ok && !warnedAboutHashConfig) {
    const diagnosis = diagnosePasswordHashConfig();
    if (diagnosis) {
      console.warn(`[admin] ${diagnosis}`);
      warnedAboutHashConfig = true;
    }
  }
  return ok;
}

export function verifyPassword(password: string) {
  const hash = resolvePasswordHash();
  if (!hash) return false;
  return verifyPasswordHash(password, hash);
}

export async function createSession() {
  const value = Buffer.from(JSON.stringify({email: process.env.ADMIN_EMAIL, exp: Date.now() + ttl * 1000})).toString("base64url");
  (await cookies()).set(cookieName, `${value}.${signValue(value, secret())}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: cookiePath,
    maxAge: ttl,
  });
}

export async function adminSession() {
  if (!configured()) return false;
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return false;
  const [value, sig] = token.split(".");
  if (!value || !sig || !timingSafeEqualStrings(signValue(value, secret()), sig)) return false;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString()).exp > Date.now();
  } catch {
    return false;
  }
}

export async function requireAdmin() {
  if (!(await adminSession())) throw new Error("UNAUTHORIZED");
}

// Explicit, ops-configured allowlist of the real domain(s) this admin is
// reachable at — e.g. "https://technoblog.esis.com.br". Deliberately NOT
// derived from the incoming request's Host/X-Forwarded-Host, nor from
// Next's own req.url: in a standalone/Docker deployment, req.url's origin
// reflects the process's own HOSTNAME bind address (typically 0.0.0.0, or
// a container ID Docker assigns automatically) — never a real client-facing
// domain — so comparing against it made every legitimate same-origin
// mutation fail once deployed outside `next dev`. HOSTNAME must stay the
// plain bind address; this env var is the correct, independent place for
// the public origin(s).
//
// Parses a comma-separated list into canonical "scheme://host:port" strings
// (http/https only, no path/query/credentials — anything else is silently
// dropped, never partially trusted) so every later comparison is exact Set
// membership, never a substring/prefix/suffix check.
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  const origins: string[] = [];
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (!value) continue;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      continue; // malformed entry — dropped, not partially trusted
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    if (parsed.username || parsed.password) continue;
    if ((parsed.pathname !== "/" && parsed.pathname !== "") || parsed.search || parsed.hash) continue;
    origins.push(parsed.origin);
  }
  return origins;
}

// Exact match only, via Set.has() — never .includes()/.endsWith() on raw
// strings, which is exactly the class of bug that lets
// "https://technoblog.esis.com.br.evil.com" or
// "https://eviltechnoblog.esis.com.br" slip past a naive substring/suffix
// check. A missing, malformed, or non-http(s) Origin header is rejected,
// same as one that parses fine but isn't in the allowlist — and an empty
// allowlist (unset or fully invalid ADMIN_ALLOWED_ORIGINS) rejects every
// request, in every environment: failing closed here is the whole point,
// not a production-only special case.
export function isAllowedOrigin(origin: string | null, allowed: string[]): boolean {
  if (!origin || allowed.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return new Set(allowed).has(parsed.origin);
}

// Second, independent layer on top of the session cookie's SameSite=Lax —
// costs nothing, not a replacement for it. Use for every mutation handler
// (anything that isn't a plain GET). `env` is injectable (defaults to
// process.env) purely so tests can exercise this without mutating global
// state, same convention as auth-crypto.ts's resolvePasswordHash.
export function originAllowed(req: Request, env: Record<string, string | undefined> = process.env): boolean {
  return isAllowedOrigin(req.headers.get("origin"), parseAllowedOrigins(env.ADMIN_ALLOWED_ORIGINS));
}

export async function requireAdminMutation(req: Request) {
  await requireAdmin();
  if (!originAllowed(req)) throw new Error("FORBIDDEN");
}

export async function clearSession() {
  // Pass the same path explicitly used when the cookie was set — deleting by
  // name alone relies on the framework defaulting to a matching path, which
  // is exactly the kind of implicit behavior that caused the path bug above.
  (await cookies()).set(cookieName, "", {path: cookiePath, maxAge: 0});
}

export function validAffiliate(url: string) {
  try {
    const u = new URL(url);
    const allow = (process.env.AFFILIATE_ALLOWED_HOSTS || "mercadolivre.com.br,lista.mercadolivre.com.br,meli.la").split(",");
    return u.protocol === "https:" && allow.some((d) => (d === "meli.la" ? u.hostname === "meli.la" : u.hostname === d || u.hostname.endsWith(`.${d}`)));
  } catch {
    return false;
  }
}
// For manufacturer/official URLs, which are not restricted to the affiliate host allowlist — just HTTPS and well-formed.
export function validHttpsUrl(url: string) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
export function id() {
  return crypto.randomUUID();
}

// Shared mapping from the two auth control-flow errors above to their HTTP
// status, so every route reports the same consistent status/shape for the
// same underlying condition instead of each one improvising its own ternary.
export function authStatus(e: unknown, fallback = 400): number {
  const message = e instanceof Error ? e.message : "";
  if (message === "UNAUTHORIZED") return 401;
  if (message === "FORBIDDEN") return 403;
  return fallback;
}
