import {NextResponse} from "next/server";
import {requireAdmin, requireAdminMutation} from "@/lib/admin";
import {deleteHomepageBlock, homepageBlockById, itemsForBlock, updateHomepageBlock} from "@/lib/homepage-blocks";
import {translateHomepageBlockError, validateHomepageBlockBody} from "@/app/api/admin/homepage-blocks/route";

export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdmin();
    const id = (await params).id;
    const block = homepageBlockById(id);
    if (!block) return NextResponse.json({error: "Não encontrado"}, {status: 404});
    return NextResponse.json({...block, items: itemsForBlock(id)});
  } catch (e) {
    const {status, message} = translateHomepageBlockError(e);
    return NextResponse.json({error: message}, {status});
  }
}

export async function PATCH(req: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdminMutation(req);
    const id = (await params).id;
    if (!homepageBlockById(id)) return NextResponse.json({error: "Bloco não encontrado"}, {status: 404});
    const body = await req.json();
    const input = validateHomepageBlockBody(body);
    const updated = updateHomepageBlock(id, input);
    return NextResponse.json(updated);
  } catch (e) {
    const {status, message} = translateHomepageBlockError(e);
    return NextResponse.json({error: message}, {status});
  }
}

export async function DELETE(req: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdminMutation(req);
    const id = (await params).id;
    if (!homepageBlockById(id)) return NextResponse.json({error: "Bloco não encontrado"}, {status: 404});
    const result = deleteHomepageBlock(id);
    if (!result.ok) return NextResponse.json({error: result.error}, {status: 409});
    return NextResponse.json({ok: true});
  } catch (e) {
    const {status, message} = translateHomepageBlockError(e);
    return NextResponse.json({error: message}, {status});
  }
}
