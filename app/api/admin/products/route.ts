import {NextResponse} from "next/server";
import {db, listProducts} from "@/lib/db";
import {authStatus, id, requireAdmin, requireAdminMutation, validAffiliate, validHttpsUrl} from "@/lib/admin";
import {brandById} from "@/lib/brands";
import {categoryById} from "@/lib/categories";

const statuses = new Set(["draft", "published", "archived"]);

function text(v: unknown, max = 4000) {
  return typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null;
}
function optionalText(v: unknown, max = 4000) {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}
function array(v: unknown) {
  return Array.isArray(v) && v.every((x) => typeof x === "string" && x.length <= 300) ? v : null;
}
function specs(v: unknown) {
  return v && typeof v === "object" && !Array.isArray(v) && Object.entries(v).every(([k, x]) => k.length < 100 && typeof x === "string" && x.length < 500) ? v : null;
}

// brand/category are still plain TEXT columns read by the public site (Fase E
// hasn't switched it to the relational model yet) — the admin form now only
// collects brandId/categoryId, so we mirror the selected row's display name
// into those legacy columns automatically instead of asking for it twice.
function resolveBrandAndCategory(b: Record<string, unknown>) {
  const brandId = text(b.brandId, 64);
  const categoryId = text(b.categoryId, 64);
  const brand = brandId ? brandById(brandId) : undefined;
  const category = categoryId ? categoryById(categoryId) : undefined;
  if (!brandId || !brand) throw new Error("Selecione uma marca válida.");
  if (!categoryId || !category) throw new Error("Selecione uma categoria válida.");
  return {brandId, categoryId, brandName: brand.name, categoryName: category.name};
}

function validate(b: Record<string, unknown>) {
  const name = text(b.name, 160), slug = text(b.slug, 120), badge = text(b.badge, 160);
  const short = text(b.shortDescription), full = text(b.fullDescription, 12000), alt = text(b.imageAlt, 300);
  const position = Number(b.position);
  const benefits = array(b.benefits), attention = array(b.attentionPoints), recommended = array(b.recommendedFor), notRecommended = array(b.notRecommendedFor);
  const specifications = specs(b.specifications);
  const status = typeof b.status === "string" && statuses.has(b.status) ? b.status : "published";
  const model = optionalText(b.model, 160);
  const editorialSummary = optionalText(b.editorialSummary, 2000);
  const verdict = optionalText(b.verdict, 500);
  const officialUrl = optionalText(b.officialUrl, 500);
  const {brandId, categoryId, brandName, categoryName} = resolveBrandAndCategory(b);
  if (officialUrl && !validHttpsUrl(officialUrl)) throw new Error("A URL oficial do fabricante precisa ser https:// válida.");
  if (
    !name || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !badge || !short || !full || !alt ||
    !Number.isInteger(position) || position < 1 || !benefits || !attention || !recommended || !notRecommended || !specifications ||
    !validAffiliate(String(b.affiliateUrl)) || !validAffiliate(String(b.searchUrl))
  ) {
    throw new Error("Dados inválidos. Confirme campos obrigatórios, slug e URLs HTTPS do Mercado Livre.");
  }
  return {name, slug, badge, short, full, alt, position, benefits, attention, recommended, notRecommended, specifications, brandId, categoryId, brandName, categoryName, status, model, editorialSummary, verdict, officialUrl};
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(listProducts());
  } catch {
    return NextResponse.json({error: "Não autorizado"}, {status: 401});
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminMutation(req);
    const raw = await req.json();
    const p = validate(raw);
    const now = new Date().toISOString();
    const record = {
      id: id(), name: p.name, slug: p.slug, brand: p.brandName, position: p.position, category: p.categoryName, badge: p.badge,
      short_description: p.short, full_description: p.full, benefits: JSON.stringify(p.benefits), attention_points: JSON.stringify(p.attention),
      specifications: JSON.stringify(p.specifications), recommended_for: JSON.stringify(p.recommended), not_recommended_for: JSON.stringify(p.notRecommended),
      affiliate_url: raw.affiliateUrl, search_url: raw.searchUrl, image_alt: p.alt, is_active: raw.isActive ? 1 : 0, is_featured: raw.isFeatured ? 1 : 0,
      created_at: now, updated_at: now,
      brand_id: p.brandId, category_id: p.categoryId, model: p.model, status: p.status, official_url: p.officialUrl, editorial_summary: p.editorialSummary, verdict: p.verdict,
    };
    db().prepare(`INSERT INTO products (${Object.keys(record).join(",")}) VALUES (${Object.keys(record).map((x) => `@${x}`).join(",")})`).run(record);
    return NextResponse.json(record, {status: 201});
  } catch (e) {
    return NextResponse.json({error: e instanceof Error ? e.message : "Não foi possível salvar"}, {status: authStatus(e)});
  }
}
