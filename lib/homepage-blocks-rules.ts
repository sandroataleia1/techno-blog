// Pure homepage-block business rules — no "server-only", no DB access, so
// this stays directly unit-testable. See lib/rankings-rules.ts for the same
// split this file mirrors: DB-bound checks live in lib/homepage-blocks.ts,
// everything checkable from plain values lives here.

export const HOMEPAGE_BLOCK_STATUSES = ["draft", "published", "archived"] as const;
export type HomepageBlockStatus = (typeof HOMEPAGE_BLOCK_STATUSES)[number];

export const HOMEPAGE_BLOCK_CONTENT_MODES = ["photo", "text", "both"] as const;
export type HomepageBlockContentMode = (typeof HOMEPAGE_BLOCK_CONTENT_MODES)[number];

export const MIN_COLUMNS = 1;
export const MAX_COLUMNS = 6;
export const MAX_BLOCK_ITEMS = 12;

// Tags an error as "deliberately thrown with a message written to be shown
// to the admin verbatim" — same convention as RankingValidationError. See
// translateHomepageBlockError() in app/api/admin/homepage-blocks/route.ts,
// the only place that turns any of this into an HTTP response.
export class HomepageBlockValidationError extends Error {}

export function isValidColumns(columns: number): boolean {
  return Number.isInteger(columns) && columns >= MIN_COLUMNS && columns <= MAX_COLUMNS;
}

// A block item's link can point either at an internal page (a site-relative
// path, e.g. "/melhores-fones-mercado-livre") or an external https URL (an
// affiliate link) — never http:, javascript:, or any other scheme.
export function isValidLinkUrl(url: string): boolean {
  if (url.startsWith("/")) return true;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export type HomepageBlockItemInput = {
  linkUrl: string;
  text: string;
  imageId: string | null;
};
export type PositionedHomepageBlockItem = HomepageBlockItemInput & {position: number};

// Never trusts a position sent by the client — position is always derived
// from array order (index + 1), same convention as rankings' assignPositions.
export function assignPositions(items: HomepageBlockItemInput[]): PositionedHomepageBlockItem[] {
  return items.map((item, index) => ({...item, position: index + 1}));
}

// Rascunho: até MAX_BLOCK_ITEMS itens, sem exigir campos preenchidos.
export function validateDraftItems(items: HomepageBlockItemInput[]): string | null {
  if (items.length > MAX_BLOCK_ITEMS) return `Um bloco pode ter no máximo ${MAX_BLOCK_ITEMS} itens.`;
  return null;
}

// Publicação: pelo menos 1 item, e cada item precisa do que o content_mode
// do bloco exige (imagem/texto), além de link — sempre obrigatório,
// independente do modo.
export function validateItemsForPublish(contentMode: HomepageBlockContentMode, items: HomepageBlockItemInput[]): string | null {
  if (items.length === 0) return "Adicione pelo menos um item para publicar.";
  if (items.length > MAX_BLOCK_ITEMS) return `Um bloco pode ter no máximo ${MAX_BLOCK_ITEMS} itens.`;
  for (const item of items) {
    if (!item.linkUrl?.trim()) return "Todo item precisa de um link para publicar.";
    if ((contentMode === "photo" || contentMode === "both") && !item.imageId) return "Todo item precisa de uma imagem neste modo, para publicar.";
    if ((contentMode === "text" || contentMode === "both") && !item.text?.trim()) return "Todo item precisa de texto neste modo, para publicar.";
  }
  return null;
}
