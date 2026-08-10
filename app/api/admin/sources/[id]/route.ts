import {NextResponse} from "next/server";
import {authStatus, requireAdmin, requireAdminMutation} from "@/lib/admin";
import {sourceById, updateSourceStatus} from "@/lib/sources";

const allowedStatus = new Set(["pending", "approved", "rejected"]);

export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdmin();
    const s = sourceById((await params).id);
    return s ? NextResponse.json(s) : NextResponse.json({error: "Não encontrada"}, {status: 404});
  } catch {
    return NextResponse.json({error: "Não autorizado"}, {status: 401});
  }
}

export async function PATCH(req: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    await requireAdminMutation(req);
    const id = (await params).id;
    const b = await req.json();
    if (!allowedStatus.has(b.status)) throw new Error("Status inválido.");
    const notes = typeof b.notes === "string" && b.notes.trim() ? b.notes.trim().slice(0, 1000) : null;
    const updated = updateSourceStatus(id, b.status, notes);
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({error: e instanceof Error ? e.message : "Não foi possível salvar"}, {status: authStatus(e)});
  }
}
