import {NextResponse} from "next/server";
import {authStatus, requireAdmin, requireAdminMutation} from "@/lib/admin";
import {categoryById, updateCategory} from "@/lib/categories";

function text(v: unknown, max = 200) {
  return typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null;
}

export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdmin();
    const c = categoryById((await params).id);
    return c ? NextResponse.json(c) : NextResponse.json({error: "Não encontrada"}, {status: 404});
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
    const description = body.description ? text(body.description, 500) : null;
    if (!name || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Informe nome e um slug válido.");
    const updated = updateCategory(id, {name, slug, description, isActive: Boolean(body.isActive)});
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Não foi possível salvar";
    const isUnique = message.includes("UNIQUE");
    return NextResponse.json({error: isUnique ? "Já existe uma categoria com este slug." : message}, {status: authStatus(e)});
  }
}
