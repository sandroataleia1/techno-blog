import {NextResponse} from "next/server";
import {authStatus, requireAdmin, requireAdminMutation} from "@/lib/admin";
import {productById} from "@/lib/db";
import {replaceProductSpecifications, specificationsForProduct} from "@/lib/specifications";

type Incoming = {specificationDefinitionId: unknown; valueText?: unknown; valueNumber?: unknown; valueBoolean?: unknown};

export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdmin();
    return NextResponse.json(specificationsForProduct((await params).id));
  } catch {
    return NextResponse.json({error: "Não autorizado"}, {status: 401});
  }
}

export async function PUT(req: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdminMutation(req);
    const id = (await params).id;
    if (!productById(id)) return NextResponse.json({error: "Produto não encontrado"}, {status: 404});
    const body = await req.json();
    if (!Array.isArray(body.values)) throw new Error("Formato inválido.");
    const values = (body.values as Incoming[])
      .filter((v) => typeof v.specificationDefinitionId === "string" && v.specificationDefinitionId)
      .map((v) => ({
        specificationDefinitionId: v.specificationDefinitionId as string,
        valueText: typeof v.valueText === "string" && v.valueText.trim() ? v.valueText.trim().slice(0, 500) : null,
        valueNumber: typeof v.valueNumber === "number" && Number.isFinite(v.valueNumber) ? v.valueNumber : null,
        valueBoolean: typeof v.valueBoolean === "boolean" ? v.valueBoolean : null,
      }));
    replaceProductSpecifications(id, values);
    return NextResponse.json(specificationsForProduct(id));
  } catch (e) {
    return NextResponse.json({error: e instanceof Error ? e.message : "Não foi possível salvar"}, {status: authStatus(e)});
  }
}
