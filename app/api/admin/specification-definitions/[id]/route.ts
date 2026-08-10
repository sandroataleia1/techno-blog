import {NextResponse} from "next/server";
import {authStatus, requireAdmin, requireAdminMutation} from "@/lib/admin";
import {deleteUnusedSpecDefinition, specDefinitionById, updateSpecDefinition} from "@/lib/specifications";

const allowedTypes = new Set(["text", "number", "boolean"]);

export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdmin();
    const d = specDefinitionById((await params).id);
    return d ? NextResponse.json(d) : NextResponse.json({error: "Não encontrada"}, {status: 404});
  } catch {
    return NextResponse.json({error: "Não autorizado"}, {status: 401});
  }
}

export async function PATCH(req: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdminMutation(req);
    const id = (await params).id;
    const b = await req.json();
    const label = typeof b.label === "string" ? b.label.trim() : "";
    const dataType = allowedTypes.has(b.dataType) ? b.dataType : null;
    const unit = typeof b.unit === "string" && b.unit.trim() ? b.unit.trim() : null;
    const comparisonOrder = Number.isFinite(Number(b.comparisonOrder)) ? Number(b.comparisonOrder) : 0;
    if (!label || !dataType) throw new Error("Informe rótulo e tipo de dado.");
    const updated = updateSpecDefinition(id, {label, dataType, unit, comparisonOrder, isKeySpecification: Boolean(b.isKeySpecification)});
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({error: e instanceof Error ? e.message : "Não foi possível salvar"}, {status: authStatus(e)});
  }
}

export async function DELETE(req: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdminMutation(req);
    const result = deleteUnusedSpecDefinition((await params).id);
    if (!result.ok) return NextResponse.json({error: result.error}, {status: 409});
    return NextResponse.json({ok: true});
  } catch (e) {
    return NextResponse.json({error: "Não autorizado"}, {status: authStatus(e, 401)});
  }
}
