import {NextResponse} from "next/server";
import {authStatus, requireAdmin, requireAdminMutation} from "@/lib/admin";
import {productById} from "@/lib/db";
import {createOffer, listOffers} from "@/lib/offers";
import {brlToCents, isMeliLaAffiliateUrl, isMercadoLivreUrl, isValidPriceCents, OFFER_STATUSES, SUPPORTED_RETAILER} from "@/lib/offers-rules";

function text(v: unknown, max = 500) {
  return typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null;
}
// Accepts a Brazilian-formatted monetary string ("219,90") — never a raw
// number — so the boundary between "text the admin typed" and "integer
// cents we persist" is exactly brlToCents, with no float math in between.
function optionalCents(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return "invalid";
  const cents = brlToCents(v);
  if (cents === null) return "invalid";
  return isValidPriceCents(cents) ? cents : "invalid";
}

export function validateOfferBody(b: Record<string, unknown>) {
  const productId = text(b.productId, 64);
  const retailer = text(b.retailer, 60);
  const affiliateUrl = text(b.affiliateUrl, 500);
  const originalProductUrl = b.originalProductUrl ? text(b.originalProductUrl, 500) : null;
  const status = typeof b.status === "string" && (OFFER_STATUSES as string[]).includes(b.status) ? (b.status as (typeof OFFER_STATUSES)[number]) : null;
  const lastCheckedAtRaw = b.lastCheckedAt ? text(String(b.lastCheckedAt), 40) : null;
  const currentPriceCents = optionalCents(b.currentPrice);
  const previousPriceCents = optionalCents(b.previousPrice);
  const internalNote = b.internalNote ? text(String(b.internalNote), 2000) : null;

  if (!productId || !productById(productId)) throw new Error("Selecione um produto válido.");
  if (retailer !== SUPPORTED_RETAILER) throw new Error(`Apenas "${SUPPORTED_RETAILER}" é suportado nesta fase.`);
  // isMeliLaAffiliateUrl only confirms https + host meli.la + a well-formed
  // URL — it does not confirm the link resolves, that the listing is active,
  // or that it belongs to this project's affiliate account. See the
  // function's doc comment in lib/offers-rules.ts.
  if (!affiliateUrl || !isMeliLaAffiliateUrl(affiliateUrl)) throw new Error("A URL afiliada precisa ser um link https://meli.la/... válido (formato apenas — confira manualmente com \"Abrir link\").");
  if (originalProductUrl && !isMercadoLivreUrl(originalProductUrl)) throw new Error("A URL original precisa ser um link do mercadolivre.com.br válido.");
  if (!status) throw new Error("Status inválido.");
  if (currentPriceCents === "invalid") throw new Error("Preço atual inválido — use o formato 219,90.");
  if (previousPriceCents === "invalid") throw new Error("Preço anterior inválido — use o formato 219,90.");
  let lastCheckedAt: string | null = null;
  if (lastCheckedAtRaw) {
    const d = new Date(lastCheckedAtRaw);
    if (Number.isNaN(d.getTime())) throw new Error("Data de verificação inválida.");
    lastCheckedAt = d.toISOString();
  }

  return {
    productId,
    retailer,
    affiliateUrl,
    originalProductUrl,
    status,
    lastCheckedAt,
    currentPriceCents,
    previousPriceCents,
    isPrimary: Boolean(b.isPrimary),
    internalNote,
  };
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(listOffers());
  } catch {
    return NextResponse.json({error: "Não autorizado"}, {status: 401});
  }
}

// Distinguishes which of the two UNIQUE indexes (migration 020) a raw
// SQLite error came from, so the admin sees an accurate message instead of
// always being told it's a duplicate URL when it might be the primary-offer
// invariant instead (both are legitimate, different situations).
export function offerConflictMessage(message: string): string | null {
  if (!message.includes("UNIQUE constraint failed")) return null;
  if (message.includes("affiliate_offers.product_id, affiliate_offers.affiliate_url")) return "Já existe uma oferta com esta URL afiliada para este produto.";
  if (message.includes("affiliate_offers.product_id, affiliate_offers.retailer")) return "Já existe outra oferta principal ativa para este produto e marketplace.";
  return "Esta oferta conflita com uma já existente.";
}

export async function POST(req: Request) {
  try {
    await requireAdminMutation(req);
    const body = await req.json();
    const input = validateOfferBody(body);
    const record = createOffer(input);
    return NextResponse.json(record, {status: 201});
  } catch (e) {
    const message = e instanceof Error ? e.message : "Não foi possível salvar";
    return NextResponse.json({error: offerConflictMessage(message) ?? message}, {status: authStatus(e)});
  }
}
