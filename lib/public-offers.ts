import "server-only";
import {db} from "@/lib/db";
import {publicPrice} from "@/lib/offers-rules";

// Deliberately narrow: only the fields a public page is allowed to show.
// No id, status, retailer, internal_note, original_product_url, or any
// timestamp beyond last_checked_at ever leaves this shape. Prices are
// integer cents (see lib/offers-rules.ts for why) — the future public page
// that consumes this is responsible for formatting them for display.
export type PublicOffer = {
  productName: string;
  productSlug: string;
  image: string | null;
  imageAlt: string;
  affiliateUrl: string;
  currentPriceCents: number | null;
  previousPriceCents: number | null;
  lastCheckedAt: string | null;
};

type Row = {
  affiliate_url: string;
  current_price_cents: number | null;
  previous_price_cents: number | null;
  last_checked_at: string | null;
  product_name: string;
  product_slug: string;
  image_id: string | null;
  image_alt: string;
};

const QUERY = `
  SELECT o.affiliate_url, o.current_price_cents, o.previous_price_cents, o.last_checked_at,
         p.name AS product_name, p.slug AS product_slug, p.image_id, p.image_alt
  FROM affiliate_offers o
  JOIN products p ON p.id = o.product_id
  WHERE o.is_primary = 1 AND o.status = 'active' AND p.is_active = 1 AND p.deleted_at IS NULL
`;

function shape(row: Row): PublicOffer {
  return {
    productName: row.product_name,
    productSlug: row.product_slug,
    image: row.image_id ? `/api/images/${row.image_id}` : null,
    imageAlt: row.image_alt,
    affiliateUrl: row.affiliate_url,
    currentPriceCents: publicPrice(row.current_price_cents, row.last_checked_at),
    previousPriceCents: publicPrice(row.previous_price_cents, row.last_checked_at),
    lastCheckedAt: row.last_checked_at,
  };
}

export function publicPrimaryOfferForProduct(productId: string): PublicOffer | null {
  const row = db().prepare(`${QUERY} AND o.product_id = ? LIMIT 1`).get(productId) as Row | undefined;
  return row ? shape(row) : null;
}

export function publicPrimaryOffers(): PublicOffer[] {
  const rows = db().prepare(`${QUERY} ORDER BY p.position`).all() as Row[];
  return rows.map(shape);
}
