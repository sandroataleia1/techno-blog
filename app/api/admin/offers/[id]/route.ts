import {NextResponse} from "next/server";
import {authStatus, requireAdmin, requireAdminMutation} from "@/lib/admin";
import {deleteOffer, offerById, updateOffer} from "@/lib/offers";
import {offerConflictMessage, validateOfferBody} from "@/app/api/admin/offers/route";

export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdmin();
    const o = offerById((await params).id);
    return o ? NextResponse.json(o) : NextResponse.json({error: "Não encontrada"}, {status: 404});
  } catch {
    return NextResponse.json({error: "Não autorizado"}, {status: 401});
  }
}

export async function PATCH(req: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdminMutation(req);
    const id = (await params).id;
    if (!offerById(id)) return NextResponse.json({error: "Oferta não encontrada"}, {status: 404});
    const body = await req.json();
    const input = validateOfferBody(body);
    const updated = updateOffer(id, input);
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Não foi possível salvar";
    return NextResponse.json({error: offerConflictMessage(message) ?? message}, {status: authStatus(e)});
  }
}

export async function DELETE(req: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdminMutation(req);
    const id = (await params).id;
    if (!offerById(id)) return NextResponse.json({error: "Oferta não encontrada"}, {status: 404});
    deleteOffer(id);
    return NextResponse.json({ok: true});
  } catch (e) {
    return NextResponse.json({error: "Não autorizado"}, {status: authStatus(e, 401)});
  }
}
