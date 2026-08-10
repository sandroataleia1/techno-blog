// Pure admin-auth primitives — deliberately NOT "server-only". That package
// resolves via a bundler-specific "browser" field remap that only webpack/
// Next's client-bundle resolution understands; under plain Node (which is
// how tests import this file directly, with --experimental-strip-types) it
// throws ERR_MODULE_NOT_FOUND instead of the no-op it is under a bundler —
// confirmed by actually running the test suite with it added. The real
// guard against client-bundling lives one layer up: lib/admin.ts (the only
// app-code importer of this file) already has "server-only", so this module
// is never reachable from client code in practice. Never log a raw value
// passed through here.
import crypto from "node:crypto";

const HASH_PATTERN = /^scrypt\$[^$]+\$[0-9a-f]+$/;

export function isValidHashFormat(value: string): boolean {
  return HASH_PATTERN.test(value);
}

/**
 * Resolves the configured scrypt hash. Prefers `ADMIN_PASSWORD_HASH` set as a
 * real process environment variable (safe anywhere: shell export, Docker
 * Compose `environment:`, a secret manager, systemd `Environment=`...).
 *
 * Falls back to `ADMIN_PASSWORD_HASH_BASE64` — a base64 encoding of the same
 * `scrypt$salt$hash` string — because Next.js's env loader (`@next/env`, used
 * for every `.env`, `.env.local`, `.env.<mode>[.local]` file) runs each
 * value through dotenv-expand, which treats an unescaped `$word` as a shell-
 * style variable reference and replaces it with `""` when that variable
 * isn't set. Our hash format is `scrypt$<hex>$<hex>`, so a raw hash placed in
 * a `.env*` file silently gets truncated to the literal string `"scrypt"`.
 * Base64's alphabet (A-Za-z0-9+/=) contains no `$`, so it survives untouched.
 */
export function resolvePasswordHash(env: Record<string, string | undefined> = process.env): string {
  const direct = env.ADMIN_PASSWORD_HASH;
  if (direct && isValidHashFormat(direct)) return direct;

  const encoded = env.ADMIN_PASSWORD_HASH_BASE64;
  if (encoded) {
    let decoded = "";
    try {
      decoded = Buffer.from(encoded, "base64").toString("utf8");
    } catch {
      decoded = "";
    }
    if (isValidHashFormat(decoded)) return decoded;
  }
  return "";
}

/**
 * Returns a human-readable, secret-free diagnostic when ADMIN_PASSWORD_HASH
 * / _BASE64 are set but don't resolve to a usable hash — or null when
 * configuration is fine (including "intentionally unset"). Never includes
 * the actual variable values, only which variable looks wrong, so it's safe
 * to print to server logs.
 */
export function diagnosePasswordHashConfig(env: Record<string, string | undefined> = process.env): string | null {
  const hasDirect = Boolean(env.ADMIN_PASSWORD_HASH);
  const hasEncoded = Boolean(env.ADMIN_PASSWORD_HASH_BASE64);
  if (!hasDirect && !hasEncoded) return null;
  if (resolvePasswordHash(env)) return null;
  if (hasDirect && !hasEncoded) {
    return 'ADMIN_PASSWORD_HASH está definida mas não tem o formato "scrypt$salt$hash" esperado. Causa mais provável: o valor foi colocado em um arquivo .env/.env.local — o carregador de ambiente do Next.js expande sequências "$palavra" nesses arquivos e corrompe o hash. Use ADMIN_PASSWORD_HASH_BASE64 nesse caso (veja o README).';
  }
  return 'ADMIN_PASSWORD_HASH_BASE64 está definida mas não decodifica para um hash "scrypt$salt$hash" válido. Gere um novo valor com scripts/create-admin-hash.mjs.';
}

export function verifyPassword(password: string, hash: string): boolean {
  const [kind, salt, expected] = hash.split("$");
  if (kind !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  // timingSafeEqual throws (instead of returning false) on a length
  // mismatch — guard explicitly so a malformed/corrupted hash can never
  // crash the request instead of just failing the login.
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function sign(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
