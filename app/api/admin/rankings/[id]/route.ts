import {NextResponse} from "next/server";
import {requireAdmin, requireAdminMutation} from "@/lib/admin";
import {deleteRanking, itemsForRanking, rankingById, updateRanking} from "@/lib/rankings";
import {translateRankingError, validateRankingBody} from "@/app/api/admin/rankings/route";

export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdmin();
    const id = (await params).id;
    const ranking = rankingById(id);
    if (!ranking) return NextResponse.json({error: "Não encontrado"}, {status: 404});
    return NextResponse.json({...ranking, items: itemsForRanking(id)});
  } catch (e) {
    const {status, message} = translateRankingError(e);
    return NextResponse.json({error: message}, {status});
  }
}

export async function PATCH(req: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdminMutation(req);
    const id = (await params).id;
    if (!rankingById(id)) return NextResponse.json({error: "Ranking não encontrado"}, {status: 404});
    const body = await req.json();
    const input = validateRankingBody(body);
    const updated = updateRanking(id, input);
    return NextResponse.json(updated);
  } catch (e) {
    const {status, message} = translateRankingError(e);
    return NextResponse.json({error: message}, {status});
  }
}

export async function DELETE(req: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdminMutation(req);
    const id = (await params).id;
    if (!rankingById(id)) return NextResponse.json({error: "Ranking não encontrado"}, {status: 404});
    const result = deleteRanking(id);
    if (!result.ok) return NextResponse.json({error: result.error}, {status: 409});
    return NextResponse.json({ok: true});
  } catch (e) {
    const {status, message} = translateRankingError(e);
    return NextResponse.json({error: message}, {status});
  }
}
