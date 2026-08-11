import "server-only";
import {db, type DbProduct} from "@/lib/db";
import {mapProductForRanking, type PublicProduct} from "@/lib/public-products";
import {publicPrimaryOffersByProductId} from "@/lib/public-offers";
import {hasContinuousPositions, hasDuplicateProductIds, validateItemsForPublish} from "@/lib/rankings-rules";

export type PublicRanking = {
  title: string;
  slug: string;
  description: string;
  methodology: string;
  publishedAt: string;
  updatedAt: string;
};

export type PublicArchivedRanking = {
  title: string;
  slug: string;
  publishedAt: string;
  updatedAt: string;
};

// Four distinct outcomes, not just "found or not": a ranking that is
// published but fails one of its own invariants must never render a
// partial Top 10 (kind "invalid" — see isValidPublishedRanking below), and
// one that was published and later archived must keep responding with its
// own tombstone rather than a bare 404 (kind "archived") — see FASE MVP-3
// section 5. Only a genuinely absent slug, or a draft/never-published
// ranking, is "not_found".
export type PublicRankingResult =
  | {kind: "not_found"}
  | {kind: "invalid"}
  | {kind: "archived"; ranking: PublicArchivedRanking}
  | {kind: "ok"; ranking: PublicRanking; items: PublicProduct[]};

type RankingRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  methodology: string | null;
  published_at: string | null;
  updated_at: string | null;
  status: string;
};
type RankingItemRow = {
  position: number;
  badge: string | null;
  reason: string | null;
  main_benefit: string | null;
  main_limitation: string | null;
  product_id: string;
};

// Everything a published ranking must satisfy before it's safe to render
// as a real Top 10 — reuses the exact same pure predicates the admin editor
// uses to decide whether a ranking is allowed to publish in the first
// place (lib/rankings-rules.ts), so the public read side can never quietly
// drift from the write side's own definition of "valid". What those pure
// functions can't check (does the product still exist / is it still
// active, published, not deleted) is checked separately below against a
// single batched product lookup — never one query per item.
function isStructurallyValid(ranking: RankingRow, items: RankingItemRow[]): boolean {
  if (!ranking.description?.trim() || !ranking.methodology?.trim()) return false;
  if (items.length !== 10) return false;
  if (!hasContinuousPositions(items.map((i) => ({position: i.position})))) return false;
  if (hasDuplicateProductIds(items.map((i) => ({productId: i.product_id})))) return false;
  const editorialError = validateItemsForPublish(
    items.map((i) => ({productId: i.product_id, badge: i.badge ?? "", reason: i.reason ?? "", mainBenefit: i.main_benefit ?? "", mainLimitation: i.main_limitation ?? ""}))
  );
  return editorialError === null;
}

export function publicRankingBySlug(slug: string): PublicRankingResult {
  const ranking = db().prepare("SELECT * FROM rankings WHERE slug=?").get(slug) as RankingRow | undefined;
  if (!ranking) return {kind: "not_found"};

  // Checked before the "must be published" rule on purpose: archived is
  // never "published" by status, but a ranking that *used to be* published
  // gets its own outcome (a tombstone), not the generic not_found one.
  if (ranking.status === "archived" && ranking.published_at) {
    return {
      kind: "archived",
      ranking: {title: ranking.title, slug: ranking.slug, publishedAt: ranking.published_at, updatedAt: ranking.updated_at ?? ranking.published_at},
    };
  }

  // Draft, or archived-and-never-published: not public at all.
  if (ranking.status !== "published") return {kind: "not_found"};

  const items = db()
    .prepare(`SELECT position, badge, reason, main_benefit, main_limitation, product_id FROM ranking_items WHERE ranking_id=? ORDER BY position`)
    .all(ranking.id) as RankingItemRow[];

  if (!isStructurallyValid(ranking, items)) return {kind: "invalid"};

  const productIds = items.map((i) => i.product_id);
  const placeholders = productIds.map(() => "?").join(",");
  // DbProduct's type omits deleted_at (listProducts/productById always
  // filter it at the query level, so callers never see it) — this query
  // deliberately doesn't filter it, specifically to be able to detect and
  // reject a soft-deleted product below, so the row is typed to include it.
  const products = db().prepare(`SELECT * FROM products WHERE id IN (${placeholders})`).all(...productIds) as (DbProduct & {deleted_at: string | null})[];
  const productsById = new Map(products.map((p) => [p.id, p]));

  // products.position/products.badge/products.short_description/
  // products.affiliate_url are never read here — every editorial field
  // below comes from the ranking_items row, and the offer (checked
  // separately) is the only source for a link.
  for (const item of items) {
    const product = productsById.get(item.product_id);
    if (!product || product.deleted_at || !product.is_active || product.status !== "published") return {kind: "invalid"};
  }

  const offers = publicPrimaryOffersByProductId();
  const publicItems = items.map((item) => {
    const product = productsById.get(item.product_id)!; // presence already confirmed above
    return mapProductForRanking(
      product,
      {position: item.position, badge: item.badge ?? "", description: item.reason ?? "", mainBenefit: item.main_benefit ?? "", mainLimitation: item.main_limitation ?? ""},
      offers.get(product.id) ?? null
    );
  });

  return {
    kind: "ok",
    ranking: {
      title: ranking.title,
      slug: ranking.slug,
      description: ranking.description ?? "",
      methodology: ranking.methodology ?? "",
      publishedAt: ranking.published_at!,
      updatedAt: ranking.updated_at ?? ranking.published_at!,
    },
    items: publicItems,
  };
}
