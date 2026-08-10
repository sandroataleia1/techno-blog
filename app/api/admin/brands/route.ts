import {NextResponse} from "next/server";
import {authStatus, requireAdmin, requireAdminMutation, validHttpsUrl} from "@/lib/admin";
import {createBrand, listBrands} from "@/lib/brands";

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function text(v: unknown, max = 200) {
  return typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null;
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(listBrands());
  } catch {
    return NextResponse.json({error: "Não autorizado"}, {status: 401});
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminMutation(req);
    const body = await req.json();
    const name = text(body.name, 160);
    const slug = text(body.slug, 120);
    const officialWebsite = body.officialWebsite ? text(body.officialWebsite, 300) : null;
    if (!name || !slug || !slugRe.test(slug)) throw new Error("Informe nome e um slug válido (letras minúsculas, números e hífens).");
    if (officialWebsite && !validHttpsUrl(officialWebsite)) throw new Error("O site oficial precisa ser uma URL https:// válida.");
    const record = createBrand({name, slug, officialWebsite});
    return NextResponse.json(record, {status: 201});
  } catch (e) {
    const message = e instanceof Error ? e.message : "Não foi possível salvar";
    const isUnique = message.includes("UNIQUE");
    return NextResponse.json({error: isUnique ? "Já existe uma marca com este slug." : message}, {status: authStatus(e)});
  }
}
