// Pure ranking business rules — no "server-only", no DB access, so this
// stays directly unit-testable (see lib/offers-rules.ts for the same split:
// DB-bound checks like "does this product exist/is it active" live in
// lib/rankings.ts, everything checkable from plain values lives here).

export const RANKING_STATUSES = ["draft", "published", "archived"] as const;
export type RankingStatus = (typeof RANKING_STATUSES)[number];

// Tags an error as "deliberately thrown with a message written to be shown
// to the admin verbatim" — every throw site in lib/rankings.ts and the
// request-body validation in app/api/admin/rankings/route.ts that
// represents a known, intentional rejection (bad input, a business rule,
// a slug conflict marker) uses this class instead of a plain Error.
// Anything that reaches a route's catch block WITHOUT this type — a
// TypeError, a JSON SyntaxError, a raw SQLite error, a genuine bug — is
// treated as unexpected and never has its .message shown to the client.
// See translateRankingError() in app/api/admin/rankings/route.ts, the only
// place that turns any of this into an HTTP response.
export class RankingValidationError extends Error {}

export const REQUIRED_PUBLISHED_ITEMS = 10;
export const MAX_DRAFT_ITEMS = 10;

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function isValidSlug(slug: string): boolean {
  return slugRe.test(slug);
}

export type RankingItemInput = {
  productId: string;
  badge: string;
  reason: string;
  mainBenefit: string;
  mainLimitation: string;
};
export type PositionedRankingItem = RankingItemInput & {position: number};

// Never trusts a position sent by the client — position is always derived
// from array order (index + 1), so "reordering" is just "resubmitting the
// items array in the new order" and the server is the only source of truth
// for what `position` ends up being.
export function assignPositions(items: RankingItemInput[]): PositionedRankingItem[] {
  return items.map((item, index) => ({...item, position: index + 1}));
}

export function hasDuplicateProductIds(items: {productId: string}[]): boolean {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.productId)) return true;
    seen.add(item.productId);
  }
  return false;
}

// Defensive invariant check — assignPositions() already guarantees this by
// construction, but keeping it as its own pure predicate lets the rule be
// asserted/tested directly instead of only implied by another function's
// implementation.
export function hasContinuousPositions(items: {position: number}[]): boolean {
  const positions = items.map((i) => i.position).sort((a, b) => a - b);
  return positions.every((p, i) => p === i + 1);
}

// Rascunho: 0 a 10 produtos, sem duplicados. Returns the error message, or
// null when the item list is fine to save as a draft.
export function validateDraftItems(items: RankingItemInput[]): string | null {
  if (items.length > MAX_DRAFT_ITEMS) return `Um ranking pode ter no máximo ${MAX_DRAFT_ITEMS} produtos.`;
  if (hasDuplicateProductIds(items)) return "Um produto não pode aparecer mais de uma vez no mesmo ranking.";
  return null;
}

// Publicação: exige exatamente 10 itens, cada um com todo o conteúdo
// editorial preenchido. Não verifica se os produtos existem/estão
// ativos/publicados — isso depende do banco e fica em lib/rankings.ts.
export function validateItemsForPublish(items: RankingItemInput[]): string | null {
  if (items.length !== REQUIRED_PUBLISHED_ITEMS) return `Para publicar, o ranking precisa de exatamente ${REQUIRED_PUBLISHED_ITEMS} produtos (há ${items.length}).`;
  if (hasDuplicateProductIds(items)) return "Um produto não pode aparecer mais de uma vez no mesmo ranking.";
  for (const item of items) {
    if (!item.badge?.trim()) return "Todo item precisa de um selo editorial para publicar.";
    if (!item.reason?.trim()) return "Todo item precisa de um motivo da posição para publicar.";
    if (!item.mainBenefit?.trim()) return "Todo item precisa de um principal benefício para publicar.";
    if (!item.mainLimitation?.trim()) return "Todo item precisa de uma principal limitação para publicar.";
  }
  return null;
}

export function validateEditorialForPublish(data: {description: string | null; methodology: string | null}): string | null {
  if (!data.description?.trim()) return "A introdução/descrição é obrigatória para publicar.";
  if (!data.methodology?.trim()) return "A metodologia é obrigatória para publicar.";
  return null;
}
