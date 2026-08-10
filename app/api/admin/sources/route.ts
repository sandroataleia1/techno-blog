import {NextResponse} from "next/server";
import {authStatus, requireAdmin, requireAdminMutation, validHttpsUrl} from "@/lib/admin";
import {createSource, listSources} from "@/lib/sources";

function text(v: unknown, max = 300) {
  return typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null;
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(listSources());
  } catch {
    return NextResponse.json({error: "Não autorizado"}, {status: 401});
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminMutation(req);
    const b = await req.json();
    const brandId = typeof b.brandId === "string" && b.brandId ? b.brandId : null;
    const productId = typeof b.productId === "string" && b.productId ? b.productId : null;
    const officialUrl = text(b.officialUrl, 500);
    if (!brandId && !productId) throw new Error("Associe a fonte a uma marca ou a um produto.");
    if (!officialUrl || !validHttpsUrl(officialUrl)) throw new Error("Informe uma URL oficial https:// válida.");
    const record = createSource({
      brandId,
      productId,
      officialUrl,
      sourceTitle: text(b.sourceTitle, 200),
      country: text(b.country, 80),
      language: text(b.language, 40),
      notes: text(b.notes, 1000),
    });
    return NextResponse.json(record, {status: 201});
  } catch (e) {
    return NextResponse.json({error: e instanceof Error ? e.message : "Não foi possível salvar"}, {status: authStatus(e)});
  }
}
