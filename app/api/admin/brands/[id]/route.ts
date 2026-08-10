import {NextResponse} from "next/server";
import {authStatus, requireAdmin, requireAdminMutation, validHttpsUrl} from "@/lib/admin";
import {brandById, updateBrand} from "@/lib/brands";

function text(v: unknown, max = 200) {
  return typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null;
}

export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdmin();
    const b = brandById((await params).id);
    return b ? NextResponse.json(b) : NextResponse.json({error: "Não encontrada"}, {status: 404});
  } catch {
    return NextResponse.json({error: "Não autorizado"}, {status: 401});
  }
}

export async function PATCH(req: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdminMutation(req);
    const id = (await params).id;
    const body = await req.json();
    const name = text(body.name, 160);
    const slug = text(body.slug, 120);
    const officialWebsite = body.officialWebsite ? text(body.officialWebsite, 300) : null;
    if (!name || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Informe nome e um slug válido.");
    if (officialWebsite && !validHttpsUrl(officialWebsite)) throw new Error("O site oficial precisa ser uma URL https:// válida.");
    const updated = updateBrand(id, {name, slug, officialWebsite, isActive: Boolean(body.isActive)});
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Não foi possível salvar";
    const isUnique = message.includes("UNIQUE");
    return NextResponse.json({error: isUnique ? "Já existe uma marca com este slug." : message}, {status: authStatus(e)});
  }
}
