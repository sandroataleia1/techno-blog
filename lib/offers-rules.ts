// Pure offer business rules — no "server-only", no DB access, so this stays
// directly unit-testable (see lib/auth-crypto.ts for why that separation
// matters: lib/db.ts and anything importing it pulls in "server-only", which
// only resolves under Next's bundler and throws under plain `node --test`
// unless the test runner asks for the "react-server" export condition —
// see tests/support/alias-hooks.mjs and package.json's "test" script).

export type OfferStatus = "active" | "inactive" | "broken";
export const OFFER_STATUSES: OfferStatus[] = ["active", "inactive", "broken"];

// Only Mercado Livre is supported in this phase — not a permanent schema
// constraint (retailer stays free-text in the DB for future marketplaces),
// just an application-level rule enforced at the API boundary.
export const SUPPORTED_RETAILER = "Mercado Livre";

// IMPORTANT — what this function does and does NOT prove:
//   - Confirms the URL is well-formed, uses https:, and its host is exactly
//     "meli.la" (a short-link domain Mercado Livre issues for affiliates).
//   - Does NOT confirm the link resolves, that the listing is active, that it
//     belongs to this project's affiliate account, or that a click here would
//     ever generate commission. None of that is checkable without an outbound
//     network call, which this phase explicitly does not make (no scraping,
//     no external API calls). Confirming those facts is a manual step for the
//     admin — see `lastCheckedAt` below and the "Abrir link" action in the UI.
//
// Rejects any URL carrying userinfo (a "user@host" or "user:pass@host"
// prefix before the real host) even when the host after the "@" is
// genuinely meli.la — legitimate affiliate short links never contain
// userinfo, and it's the classic trick for making a link *display* as one
// host while the browser navigates to a different one (e.g.
// "https://meli.la@evil.example/x" — host is evil.example, not meli.la, but
// a naive prefix check would be fooled). new URL() already parses the host
// correctly (u.hostname would be "evil.example" there, so the equality check
// below would already reject it) — the explicit username/password check is
// a second, independent guard against the same class of trick landing here
// through some other input path in the future.
export function isMeliLaAffiliateUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.username || u.password) return false;
    return u.protocol === "https:" && u.hostname === "meli.la";
  } catch {
    return false;
  }
}

// The optional "original product page" reference, if kept, must be a real
// mercadolivre.com.br URL (or subdomain, e.g. lista.mercadolivre.com.br).
// Same scope limits as isMeliLaAffiliateUrl above: structure only, no
// existence/ownership check, and userinfo is rejected for the same reason.
export function isMercadoLivreUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.username || u.password) return false;
    return u.protocol === "https:" && (u.hostname === "mercadolivre.com.br" || u.hostname.endsWith(".mercadolivre.com.br"));
  } catch {
    return false;
  }
}

export function isValidPriceCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

// Parses a Brazilian-formatted monetary string ("219,90", "1.234,56", "R$
// 219,90") into integer cents. Returns null for empty input or anything that
// doesn't match an accepted shape — never guesses, never falls back to 0.
//
// Deliberately never does `Number(text) * 100`: parsing a decimal string to
// a JS `number` and then multiplying is exactly the float-precision bug this
// function exists to avoid (e.g. 219.9 * 100 can yield
// 21989.999999999996 in IEEE-754 binary floating point). Instead, the
// integer-reais and the two-digit-cents groups are matched as separate
// strings by the regex and combined with integer arithmetic only — no value
// here is ever a fractional float.
export function brlToCents(input: string): number | null {
  const cleaned = input.trim().replace(/^R\$\s*/i, "").trim();
  if (!cleaned) return null;

  // Brazilian format: "." groups thousands, "," separates cents — e.g. "1.234,56".
  let m = /^(\d{1,3}(?:\.\d{3})*),(\d{2})$/.exec(cleaned);
  if (m) return Number(m[1].replace(/\./g, "")) * 100 + Number(m[2]);

  // Plain "1234,56" (no thousands separator).
  m = /^(\d+),(\d{2})$/.exec(cleaned);
  if (m) return Number(m[1]) * 100 + Number(m[2]);

  // Whole reais, no cents at all — "1234" means R$ 1.234,00.
  m = /^\d+$/.exec(cleaned);
  if (m) return Number(cleaned) * 100;

  return null;
}

// Formats integer cents back into a Brazilian-formatted string ("21990" -> "219,90")
// for pre-filling the edit form. Assumes non-negative input — negative
// prices are rejected at the validation boundary before storage.
export function centsToBrl(cents: number | null): string {
  if (cents === null) return "";
  const reais = Math.trunc(cents / 100);
  const centavos = String(cents % 100).padStart(2, "0");
  const withThousands = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withThousands},${centavos}`;
}

// An offer can only be "primary" while it's active — an inactive or broken
// offer being flagged primary is a confusing, meaningless state ("the main
// offer" that isn't actually offered), so this is enforced unconditionally
// here rather than left to the caller to remember on every status change.
export function resolvePrimaryFlag(requestedPrimary: boolean, status: OfferStatus): boolean {
  return requestedPrimary && status === "active";
}

// A price should never be shown publicly without knowing when it was last
// manually confirmed — an unverified number is worse than no number.
export function publicPrice(cents: number | null, lastCheckedAt: string | null): number | null {
  return lastCheckedAt ? cents : null;
}

// The struck-through "previous price" only makes sense to show as a
// discount signal — if it isn't actually higher than the current price,
// showing it would be misleading (or just noise), so it's hidden rather
// than shown as if it were meaningful. Deliberately not a percentage: the
// task is "show it was cheaper before", not "claim a specific discount".
export function shouldShowPreviousPrice(currentCents: number | null, previousCents: number | null): boolean {
  return currentCents !== null && previousCents !== null && previousCents > currentCents;
}

// Formats integer cents as Brazilian currency for display. The division by
// 100 here is display-only — Intl.NumberFormat's internal rounding
// operates on the resulting float exactly like showing "R$ 219,90" from
// the number 219.9 always has (this is not the "parseFloat(text) * 100"
// class of bug the storage layer avoids; that bug is about *deriving* a
// cents integer from user-typed text, not about *displaying* one).
const brl = new Intl.NumberFormat("pt-BR", {style: "currency", currency: "BRL"});
export function formatCentsToBRL(cents: number): string {
  return brl.format(cents / 100);
}
