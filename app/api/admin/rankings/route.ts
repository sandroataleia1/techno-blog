import {NextResponse} from "next/server";
import {requireAdmin, requireAdminMutation} from "@/lib/admin";
import {createRanking, listRankings} from "@/lib/rankings";
import {RANKING_STATUSES, type RankingItemInput, type RankingStatus} from "@/lib/rankings-rules";

function text(v: unknown, max = 300) {
  return typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null;
}
function optionalText(v: unknown, max = 5000) {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function str(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}
function parseItems(v: unknown): RankingItemInput[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      return {productId: str(r.productId), badge: str(r.badge), reason: str(r.reason), mainBenefit: str(r.mainBenefit), mainLimitation: str(r.mainLimitation)};
    })
    .filter((item) => item.productId);
}

export function validateRankingBody(b: Record<string, unknown>) {
  const title = text(b.title, 200);
  const slug = text(b.slug, 160);
  const categoryId = text(b.categoryId, 64);
  const description = optionalText(b.description);
  const methodology = optionalText(b.methodology);
  const status = typeof b.status === "string" && (RANKING_STATUSES as readonly string[]).includes(b.status) ? (b.status as RankingStatus) : null;
  const items = parseItems(b.items);
  if (!title) throw new Error("Título é obrigatório.");
  if (!slug) throw new Error("Slug é obrigatório.");
  if (!status) throw new Error("Status inválido.");
  return {title, slug, categoryId, description, methodology, status, items};
}

// Distinguishes the different failure shapes lib/rankings.ts can throw so
// the admin sees an accurate message and status instead of a generic 400
// for everything (mirrors app/api/admin/offers/route.ts's
// offerConflictMessage — same reasoning: a raw thrown Error's message is
// already the right PT-BR user-facing text for validation failures, but a
// few specific cases need their own status code).
export function rankingConflictMessage(message: string): string | null {
  if (message === "SLUG_TAKEN") return "Já existe um ranking com este slug.";
  if (message === "SLUG_LOCKED") return "O slug não pode ser alterado depois da primeira publicação.";
  if (message.includes("UNIQUE constraint failed")) return "Este ranking conflita com dados já existentes.";
  if (message.includes("FOREIGN KEY constraint failed")) return "Um dos produtos selecionados não existe mais.";
  return null;
}
export function rankingErrorStatus(e: unknown): number {
  const message = e instanceof Error ? e.message : "";
  if (message === "UNAUTHORIZED") return 401;
  if (message === "FORBIDDEN") return 403;
  if (message === "SLUG_TAKEN" || message === "SLUG_LOCKED" || message.includes("UNIQUE constraint failed")) return 409;
  return 400;
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(listRankings());
  } catch {
    return NextResponse.json({error: "Não autorizado"}, {status: 401});
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminMutation(req);
    const body = await req.json();
    const input = validateRankingBody(body);
    const record = createRanking(input);
    return NextResponse.json(record, {status: 201});
  } catch (e) {
    const message = e instanceof Error ? e.message : "Não foi possível salvar";
    return NextResponse.json({error: rankingConflictMessage(message) ?? message}, {status: rankingErrorStatus(e)});
  }
}
