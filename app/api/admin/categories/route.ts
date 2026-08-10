import {NextResponse} from "next/server";
import {authStatus, requireAdmin, requireAdminMutation} from "@/lib/admin";
import {createCategory, listCategories} from "@/lib/categories";

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function text(v: unknown, max = 200) {
  return typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null;
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(listCategories());
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
    const description = body.description ? text(body.description, 500) : null;
    if (!name || !slug || !slugRe.test(slug)) throw new Error("Informe nome e um slug válido (letras minúsculas, números e hífens).");
    const record = createCategory({name, slug, description});
    return NextResponse.json(record, {status: 201});
  } catch (e) {
    const message = e instanceof Error ? e.message : "Não foi possível salvar";
    const isUnique = message.includes("UNIQUE");
    return NextResponse.json({error: isUnique ? "Já existe uma categoria com este slug." : message}, {status: authStatus(e)});
  }
}
