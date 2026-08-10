import {NextResponse} from "next/server";
import {authStatus, requireAdmin, requireAdminMutation} from "@/lib/admin";
import {createSpecDefinition, listSpecDefinitions} from "@/lib/specifications";

const allowedTypes = new Set(["text", "number", "boolean"]);

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const categoryId = new URL(req.url).searchParams.get("categoryId") ?? undefined;
    return NextResponse.json(listSpecDefinitions(categoryId));
  } catch {
    return NextResponse.json({error: "Não autorizado"}, {status: 401});
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminMutation(req);
    const b = await req.json();
    const categoryId = typeof b.categoryId === "string" && b.categoryId ? b.categoryId : null;
    const key = typeof b.key === "string" ? b.key.trim().toLowerCase() : "";
    const label = typeof b.label === "string" ? b.label.trim() : "";
    const dataType = allowedTypes.has(b.dataType) ? b.dataType : null;
    const unit = typeof b.unit === "string" && b.unit.trim() ? b.unit.trim() : null;
    const comparisonOrder = Number.isFinite(Number(b.comparisonOrder)) ? Number(b.comparisonOrder) : 0;
    if (!categoryId || !key || !/^[a-z0-9_]+$/.test(key) || !label || !dataType) {
      throw new Error("Informe categoria, chave (letras minúsculas/números/underscore), rótulo e tipo de dado.");
    }
    const record = createSpecDefinition({categoryId, key, label, dataType, unit, comparisonOrder, isKeySpecification: Boolean(b.isKeySpecification)});
    return NextResponse.json(record, {status: 201});
  } catch (e) {
    const message = e instanceof Error ? e.message : "Não foi possível salvar";
    const isUnique = message.includes("UNIQUE");
    return NextResponse.json({error: isUnique ? "Já existe uma especificação com esta chave para a categoria." : message}, {status: authStatus(e)});
  }
}
