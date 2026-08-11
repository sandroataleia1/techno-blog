import "server-only";
import crypto from "node:crypto";
import {db} from "@/lib/db";
import {
  assignPositions,
  isValidSlug,
  RankingValidationError,
  validateDraftItems,
  validateEditorialForPublish,
  validateItemsForPublish,
  type RankingItemInput,
  type RankingStatus,
} from "@/lib/rankings-rules";

export type DbRanking = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  methodology: string | null;
  published_at: string | null;
  updated_at: string | null;
  status: RankingStatus;
};
export type DbRankingItem = {
  id: string;
  ranking_id: string;
  product_id: string;
  position: number;
  badge: string | null;
  reason: string | null;
  main_benefit: string | null;
  main_limitation: string | null;
};
export type RankingWithCounts = DbRanking & {category_name: string | null; item_count: number};
export type RankingItemWithProduct = DbRankingItem & {product_name: string; product_slug: string};

export const listRankings = (): RankingWithCounts[] =>
  db()
    .prepare(
      `SELECT r.*, c.name AS category_name, (SELECT count(*) FROM ranking_items ri WHERE ri.ranking_id=r.id) AS item_count
       FROM rankings r LEFT JOIN categories c ON c.id=r.category_id
       ORDER BY r.updated_at DESC`
    )
    .all() as RankingWithCounts[];

export const rankingById = (id: string) => db().prepare("SELECT * FROM rankings WHERE id=?").get(id) as DbRanking | undefined;

export const itemsForRanking = (rankingId: string): RankingItemWithProduct[] =>
  db()
    .prepare(
      `SELECT ri.*, p.name AS product_name, p.slug AS product_slug
       FROM ranking_items ri JOIN products p ON p.id=ri.product_id
       WHERE ri.ranking_id=? ORDER BY ri.position`
    )
    .all(rankingId) as RankingItemWithProduct[];

export type RankingInput = {
  title: string;
  slug: string;
  categoryId: string | null;
  description: string | null;
  methodology: string | null;
  status: RankingStatus;
  items: RankingItemInput[];
};

function assertSlugAvailable(slug: string, exceptId?: string) {
  const row = db().prepare("SELECT id FROM rankings WHERE slug=?").get(slug) as {id: string} | undefined;
  if (row && row.id !== exceptId) throw new RankingValidationError("SLUG_TAKEN");
}

function assertCategoryActive(categoryId: string | null) {
  if (!categoryId) throw new RankingValidationError("Selecione uma categoria válida.");
  const cat = db().prepare("SELECT is_active FROM categories WHERE id=?").get(categoryId) as {is_active: number} | undefined;
  if (!cat || !cat.is_active) throw new RankingValidationError("A categoria selecionada não existe ou está inativa.");
}

// Publish-only DB-bound checks: existence/active/published/not-deleted can't
// be verified by lib/rankings-rules.ts (pure, no DB access), so they live
// here, run only when the target status is "published".
function assertProductsPublishable(items: RankingItemInput[]) {
  if (items.length === 0) return;
  const ids = items.map((i) => i.productId);
  const placeholders = ids.map(() => "?").join(",");
  const rows = db()
    .prepare(`SELECT id,is_active,status,deleted_at FROM products WHERE id IN (${placeholders})`)
    .all(...ids) as {id: string; is_active: number; status: string; deleted_at: string | null}[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const productId of ids) {
    const p = byId.get(productId);
    if (!p) throw new RankingValidationError("Um dos produtos selecionados não existe mais.");
    if (p.deleted_at) throw new RankingValidationError("Um dos produtos selecionados foi excluído.");
    if (!p.is_active) throw new RankingValidationError("Um dos produtos selecionados está inativo.");
    if (p.status !== "published") throw new RankingValidationError("Um dos produtos selecionados não está com status publicado.");
  }
}

function assertPublishable(input: Pick<RankingInput, "items" | "description" | "methodology">) {
  const itemsError = validateItemsForPublish(input.items);
  if (itemsError) throw new RankingValidationError(itemsError);
  const editorialError = validateEditorialForPublish(input);
  if (editorialError) throw new RankingValidationError(editorialError);
  assertProductsPublishable(input.items);
}

// Atomic replace: deletes every existing item for this ranking, then
// inserts the submitted set with server-computed positions. Always called
// from inside the caller's conn.transaction() — a failure here (e.g. a
// product_id that no longer exists, tripping the ranking_items -> products
// foreign key) rolls back the delete together with the ranking row's own
// write, never leaving the ranking without its previous items.
function writeItems(conn: ReturnType<typeof db>, rankingId: string, items: RankingItemInput[]) {
  conn.prepare("DELETE FROM ranking_items WHERE ranking_id=?").run(rankingId);
  const positioned = assignPositions(items);
  const insert = conn.prepare(
    "INSERT INTO ranking_items (id,ranking_id,product_id,position,badge,reason,main_benefit,main_limitation) VALUES (?,?,?,?,?,?,?,?)"
  );
  for (const item of positioned) {
    insert.run(crypto.randomUUID(), rankingId, item.productId, item.position, item.badge || null, item.reason || null, item.mainBenefit || null, item.mainLimitation || null);
  }
}

export function createRanking(input: RankingInput): DbRanking {
  if (!input.title?.trim()) throw new RankingValidationError("Título é obrigatório.");
  if (!isValidSlug(input.slug)) throw new RankingValidationError("Slug inválido — use letras minúsculas, números e hífens.");
  assertCategoryActive(input.categoryId);
  const itemsError = validateDraftItems(input.items);
  if (itemsError) throw new RankingValidationError(itemsError);
  if (input.status === "published") assertPublishable(input);
  assertSlugAvailable(input.slug);

  const conn = db();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const publishedAt = input.status === "published" ? now : null;
  conn.transaction(() => {
    conn
      .prepare("INSERT INTO rankings (id,title,slug,description,category_id,methodology,published_at,updated_at,status) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(id, input.title, input.slug, input.description, input.categoryId, input.methodology, publishedAt, now, input.status);
    writeItems(conn, id, input.items);
  })();
  return rankingById(id)!;
}

export function updateRanking(id: string, input: RankingInput): DbRanking | undefined {
  const existing = rankingById(id);
  if (!existing) return undefined;
  if (!input.title?.trim()) throw new RankingValidationError("Título é obrigatório.");
  if (!isValidSlug(input.slug)) throw new RankingValidationError("Slug inválido — use letras minúsculas, números e hífens.");
  // Slug lock: once a ranking has ever been published (published_at set),
  // its slug is permanently frozen — even if it's later archived — so a
  // future public page never has to worry about a stale/broken URL.
  if (existing.published_at && input.slug !== existing.slug) throw new RankingValidationError("SLUG_LOCKED");
  assertCategoryActive(input.categoryId);
  const itemsError = validateDraftItems(input.items);
  if (itemsError) throw new RankingValidationError(itemsError);
  if (input.status === "published") assertPublishable(input);
  assertSlugAvailable(input.slug, id);

  const conn = db();
  const now = new Date().toISOString();
  // published_at is set once, on the first transition into "published", and
  // never touched again by any later edit, re-publish, or archive.
  const publishedAt = existing.published_at ?? (input.status === "published" ? now : null);
  conn.transaction(() => {
    conn
      .prepare("UPDATE rankings SET title=?,slug=?,description=?,category_id=?,methodology=?,published_at=?,updated_at=?,status=? WHERE id=?")
      .run(input.title, input.slug, input.description, input.categoryId, input.methodology, publishedAt, now, input.status, id);
    writeItems(conn, id, input.items);
  })();
  return rankingById(id);
}

// Definitive delete is only allowed for a ranking that was never published
// (published_at IS NULL) — anything that has ever gone live must be
// archived instead, so a public URL that was once real never silently
// 404s without a trace.
export function deleteRanking(id: string): {ok: true} | {ok: false; error: string} {
  const existing = rankingById(id);
  if (!existing) return {ok: false, error: "Ranking não encontrado."};
  if (existing.published_at) return {ok: false, error: "Rankings já publicados não podem ser excluídos — arquive em vez de excluir."};
  const conn = db();
  conn.transaction(() => {
    conn.prepare("DELETE FROM ranking_items WHERE ranking_id=?").run(id);
    conn.prepare("DELETE FROM rankings WHERE id=?").run(id);
  })();
  return {ok: true};
}
