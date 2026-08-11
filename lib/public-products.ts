import "server-only";
import {listProducts, type DbProduct} from "@/lib/db";
import {publicPrimaryOffersByProductId, type PublicOfferSummary} from "@/lib/public-offers";

const parse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
};

// The public-safe shape every display component (RankCard, RankRow,
// Catalog, Comparator, the product page) renders from. `position`,
// `badge`, `description` and `mainBenefit` default to the product's own
// legacy editorial fields here (used by the homepage's ad-hoc picks and
// the product page's "alternatives" grid, neither of which are "the
// ranking"), but lib/public-rankings.ts overrides all four with
// ranking_items' own position/badge/reason/main_benefit for anything
// rendered as part of a real published ranking — see that file for why
// products.position/badge/short_description are off-limits there.
// `affiliateUrl` never appears on this type at all: `offer` (or its
// absence) is the only source a CTA is allowed to render from.
export type PublicProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  position: number;
  badge: string;
  description: string;
  mainBenefit: string;
  benefits: string[];
  limitations: string[];
  type: "TWS" | "Headphone";
  battery: string;
  anc: string;
  codec: string;
  resistance: string;
  multipoint: string;
  use: string[];
  priceBand: string;
  image: string;
  alt: string;
  searchUrl: string;
  featured: boolean;
  updatedAt: string;
  offer: PublicOfferSummary | null;
};

function mapProductRow(p: DbProduct, offer: PublicOfferSummary | null): PublicProduct {
  const spec = parse(p.specifications) as Record<string, string>;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    category: p.category,
    position: p.position,
    badge: p.badge,
    description: p.short_description,
    mainBenefit: p.category,
    benefits: parse(p.benefits),
    limitations: parse(p.attention_points),
    type: spec.Tipo === "Headphone" ? "Headphone" : "TWS",
    battery: spec.Bateria || "Não informado",
    anc: spec.ANC || "Não informado",
    codec: spec.Codec || "Não informado",
    resistance: spec.Resistência || "Não informado",
    multipoint: spec.Multiponto || "Não informado",
    use: parse(p.recommended_for),
    priceBand: "Não informado",
    image: p.image_id ? `/api/images/${p.image_id}` : "",
    alt: p.image_alt,
    searchUrl: p.search_url,
    featured: Boolean(p.is_featured),
    updatedAt: p.updated_at,
    offer,
  };
}

// Overrides position/badge/description/mainBenefit with a ranking's own
// editorial fields — used exclusively by lib/public-rankings.ts. Kept here
// (not duplicated there) so the two callers can never drift on how a
// DbProduct row becomes the rest of a PublicProduct's fields (image, specs,
// benefits/limitations, etc.).
export function mapProductForRanking(
  p: DbProduct,
  overrides: {position: number; badge: string; description: string; mainBenefit: string; mainLimitation: string},
  offer: PublicOfferSummary | null
): PublicProduct {
  const {mainLimitation, ...rest} = overrides;
  // limitations[0] is the only slot the UI ever reads (rank-caution) — a
  // fresh single-element array keeps this symmetric with the other four
  // ranking_items-sourced fields (full replacement, not a merge with the
  // product's own legacy attention_points).
  return {...mapProductRow(p, offer), ...rest, limitations: [mainLimitation]};
}

export function publicProducts(): PublicProduct[] {
  const offers = publicPrimaryOffersByProductId();
  return listProducts(true).map((p) => mapProductRow(p, offers.get(p.id) ?? null));
}
