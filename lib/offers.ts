import "server-only";
import crypto from "node:crypto";
import {db} from "@/lib/db";
import {resolvePrimaryFlag, type OfferStatus} from "@/lib/offers-rules";

export type DbAffiliateOffer = {
  id: string;
  product_id: string;
  retailer: string;
  affiliate_url: string;
  original_product_url: string | null;
  status: OfferStatus;
  last_checked_at: string | null;
  current_price_cents: number | null;
  previous_price_cents: number | null;
  is_primary: number;
  internal_note: string | null;
};
export type OfferWithProduct = DbAffiliateOffer & {product_name: string; product_slug: string};

export const listOffers = (): OfferWithProduct[] =>
  db()
    .prepare(
      `SELECT o.*, p.name AS product_name, p.slug AS product_slug
       FROM affiliate_offers o JOIN products p ON p.id = o.product_id
       ORDER BY p.position, o.is_primary DESC, o.retailer`
    )
    .all() as OfferWithProduct[];

export const offerById = (id: string) => db().prepare("SELECT * FROM affiliate_offers WHERE id=?").get(id) as DbAffiliateOffer | undefined;

export const offersForProduct = (productId: string) => db().prepare("SELECT * FROM affiliate_offers WHERE product_id=? ORDER BY is_primary DESC, retailer").all(productId) as DbAffiliateOffer[];

type OfferInput = {
  productId: string;
  retailer: string;
  affiliateUrl: string;
  originalProductUrl: string | null;
  status: OfferStatus;
  lastCheckedAt: string | null;
  currentPriceCents: number | null;
  previousPriceCents: number | null;
  isPrimary: boolean;
  internalNote: string | null;
};

// Only one row per (product, retailer) may be primary+active — enforced
// twice over: this demotes any sibling before promoting the target (so the
// common case never even touches the DB-level guard), and a partial unique
// index (migration 020) rejects it outright if two rows somehow both try to
// hold that state, as a backstop against a bug here, not the primary
// mechanism.
function demoteSiblings(conn: ReturnType<typeof db>, productId: string, retailer: string, exceptId: string) {
  conn.prepare("UPDATE affiliate_offers SET is_primary=0 WHERE product_id=? AND retailer=? AND id!=?").run(productId, retailer, exceptId);
}

export function createOffer(input: OfferInput): DbAffiliateOffer {
  const conn = db();
  const isPrimary = resolvePrimaryFlag(input.isPrimary, input.status);
  const record = {
    id: crypto.randomUUID(),
    product_id: input.productId,
    retailer: input.retailer,
    affiliate_url: input.affiliateUrl,
    original_product_url: input.originalProductUrl,
    status: input.status,
    last_checked_at: input.lastCheckedAt,
    current_price_cents: input.currentPriceCents,
    previous_price_cents: input.previousPriceCents,
    is_primary: isPrimary ? 1 : 0,
    internal_note: input.internalNote,
  };
  conn.transaction(() => {
    // Demote any existing primary BEFORE inserting the new one — the partial
    // unique index only allows one (product_id,retailer) row with
    // is_primary=1 AND status='active' to exist at any instant, so inserting
    // the new primary row first (while the old one still holds that flag)
    // would trip the constraint itself instead of cleanly replacing it.
    if (isPrimary) demoteSiblings(conn, record.product_id, record.retailer, record.id);
    conn
      .prepare(
        "INSERT INTO affiliate_offers (id,product_id,retailer,affiliate_url,original_product_url,status,last_checked_at,current_price_cents,previous_price_cents,is_primary,internal_note) VALUES (@id,@product_id,@retailer,@affiliate_url,@original_product_url,@status,@last_checked_at,@current_price_cents,@previous_price_cents,@is_primary,@internal_note)"
      )
      .run(record);
  })();
  return offerById(record.id)!;
}

export function updateOffer(id: string, input: OfferInput): DbAffiliateOffer | undefined {
  const conn = db();
  const isPrimary = resolvePrimaryFlag(input.isPrimary, input.status);
  conn.transaction(() => {
    // Same ordering reason as createOffer: demote first so this row is never
    // briefly the second (product_id,retailer) row holding is_primary=1.
    if (isPrimary) demoteSiblings(conn, input.productId, input.retailer, id);
    conn
      .prepare(
        `UPDATE affiliate_offers SET product_id=@product_id,retailer=@retailer,affiliate_url=@affiliate_url,original_product_url=@original_product_url,
         status=@status,last_checked_at=@last_checked_at,current_price_cents=@current_price_cents,previous_price_cents=@previous_price_cents,is_primary=@is_primary,internal_note=@internal_note
         WHERE id=@id`
      )
      .run({
        id,
        product_id: input.productId,
        retailer: input.retailer,
        affiliate_url: input.affiliateUrl,
        original_product_url: input.originalProductUrl,
        status: input.status,
        last_checked_at: input.lastCheckedAt,
        current_price_cents: input.currentPriceCents,
        previous_price_cents: input.previousPriceCents,
        is_primary: isPrimary ? 1 : 0,
        internal_note: input.internalNote,
      });
  })();
  return offerById(id);
}

export function setOfferStatus(id: string, status: OfferStatus): DbAffiliateOffer | undefined {
  const conn = db();
  const current = offerById(id);
  if (!current) return undefined;
  const isPrimary = resolvePrimaryFlag(Boolean(current.is_primary), status);
  conn.prepare("UPDATE affiliate_offers SET status=?, is_primary=? WHERE id=?").run(status, isPrimary ? 1 : 0, id);
  return offerById(id);
}

// Nothing in the schema references affiliate_offers.id (no click-tracking
// table exists yet in this phase), so a hard delete is safe — unlike
// specification_definitions or brands, there is no "in use elsewhere" state
// to protect against.
export function deleteOffer(id: string) {
  db().prepare("DELETE FROM affiliate_offers WHERE id=?").run(id);
}
