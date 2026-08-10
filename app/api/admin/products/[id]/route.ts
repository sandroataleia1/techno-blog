import {NextResponse} from "next/server";
import {db, productById} from "@/lib/db";
import {authStatus, requireAdmin, requireAdminMutation, validAffiliate, validHttpsUrl} from "@/lib/admin";
import {brandById} from "@/lib/brands";
import {categoryById} from "@/lib/categories";

const statuses = new Set(["draft", "published", "archived"]);

export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdmin();
    const p = productById((await params).id);
    return p ? NextResponse.json(p) : NextResponse.json({error: "Não encontrado"}, {status: 404});
  } catch {
    return NextResponse.json({error: "Não autorizado"}, {status: 401});
  }
}

export async function PATCH(req: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdminMutation(req);
    const id = (await params).id;
    const b = await req.json();
    if (
      typeof b.name !== "string" || typeof b.slug !== "string" || !b.name.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b.slug) ||
      !Number.isInteger(Number(b.position)) || Number(b.position) < 1 || !validAffiliate(String(b.affiliateUrl)) || !validAffiliate(String(b.searchUrl))
    ) throw new Error("Dados inválidos.");
    const brand = typeof b.brandId === "string" && b.brandId ? brandById(b.brandId) : undefined;
    const category = typeof b.categoryId === "string" && b.categoryId ? categoryById(b.categoryId) : undefined;
    if (!brand) throw new Error("Selecione uma marca válida.");
    if (!category) throw new Error("Selecione uma categoria válida.");
    const officialUrl = typeof b.officialUrl === "string" && b.officialUrl.trim() ? b.officialUrl.trim() : null;
    if (officialUrl && !validHttpsUrl(officialUrl)) throw new Error("A URL oficial do fabricante precisa ser https:// válida.");
    const status = statuses.has(b.status) ? b.status : "published";
    const fields = {
      name: b.name.trim(), slug: b.slug, brand: brand.name, position: Number(b.position), category: category.name, badge: String(b.badge || ""),
      short_description: String(b.shortDescription || ""), full_description: String(b.fullDescription || ""),
      benefits: JSON.stringify(Array.isArray(b.benefits) ? b.benefits : []), attention_points: JSON.stringify(Array.isArray(b.attentionPoints) ? b.attentionPoints : []),
      specifications: JSON.stringify(b.specifications && typeof b.specifications === "object" ? b.specifications : {}),
      recommended_for: JSON.stringify(Array.isArray(b.recommendedFor) ? b.recommendedFor : []), not_recommended_for: JSON.stringify(Array.isArray(b.notRecommendedFor) ? b.notRecommendedFor : []),
      affiliate_url: b.affiliateUrl, search_url: b.searchUrl, image_alt: String(b.imageAlt || ""),
      is_active: b.isActive ? 1 : 0, is_featured: b.isFeatured ? 1 : 0, updated_at: new Date().toISOString(),
      brand_id: brand.id, category_id: category.id, model: typeof b.model === "string" && b.model.trim() ? b.model.trim() : null,
      status, official_url: officialUrl, editorial_summary: typeof b.editorialSummary === "string" && b.editorialSummary.trim() ? b.editorialSummary.trim() : null,
      verdict: typeof b.verdict === "string" && b.verdict.trim() ? b.verdict.trim() : null,
      id,
    };
    db().prepare(`UPDATE products SET ${Object.keys(fields).filter((k) => k !== "id").map((k) => `${k}=@${k}`).join(",")} WHERE id=@id AND deleted_at IS NULL`).run(fields);
    return NextResponse.json(productById(id));
  } catch (e) {
    return NextResponse.json({error: e instanceof Error ? e.message : "Não foi possível salvar"}, {status: authStatus(e)});
  }
}

export async function DELETE(req: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdminMutation(req);
    const id = (await params).id;
    db().prepare("UPDATE products SET is_active=0, deleted_at=?, updated_at=? WHERE id=?").run(new Date().toISOString(), new Date().toISOString(), id);
    return NextResponse.json({ok: true});
  } catch (e) {
    return NextResponse.json({error: "Não autorizado"}, {status: authStatus(e, 401)});
  }
}
