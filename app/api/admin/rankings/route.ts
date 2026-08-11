import {NextResponse} from "next/server";
import {requireAdmin, requireAdminMutation} from "@/lib/admin";
import {createRanking, listRankings} from "@/lib/rankings";
import {RANKING_STATUSES, RankingValidationError, type RankingItemInput, type RankingStatus} from "@/lib/rankings-rules";

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

// A malformed body (null, an array, a string, a number...) must never reach
// a `.title`-style property access below — that would throw a raw
// TypeError whose message leaks implementation detail. Guard the shape
// explicitly, before touching any field, and report it the same way any
// other deliberate validation rejection is reported.
function assertPlainObject(body: unknown): asserts body is Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new RankingValidationError("Corpo da requisição inválido.");
  }
}

export function validateRankingBody(body: unknown) {
  assertPlainObject(body);
  const title = text(body.title, 200);
  const slug = text(body.slug, 160);
  const categoryId = text(body.categoryId, 64);
  const description = optionalText(body.description);
  const methodology = optionalText(body.methodology);
  const status = typeof body.status === "string" && (RANKING_STATUSES as readonly string[]).includes(body.status) ? (body.status as RankingStatus) : null;
  const items = parseItems(body.items);
  if (!title) throw new RankingValidationError("Título é obrigatório.");
  if (!slug) throw new RankingValidationError("Slug é obrigatório.");
  if (!status) throw new RankingValidationError("Status inválido.");
  return {title, slug, categoryId, description, methodology, status, items};
}

// Marker messages a RankingValidationError can carry that need translating
// to a different public message and status (409, not the default 400).
function knownConflict(message: string): {status: number; message: string} | null {
  if (message === "SLUG_TAKEN") return {status: 409, message: "Já existe um ranking com este slug."};
  if (message === "SLUG_LOCKED") return {status: 409, message: "O slug não pode ser alterado depois da primeira publicação."};
  return null;
}

// Known SQLite-level integrity conflicts that can still legitimately occur
// even after application-level validation (e.g. a race between the
// existence check and the write) — translated the same way a pre-validated
// rejection would be, never shown as raw SQL.
function knownDatabaseConflict(message: string): {status: number; message: string} | null {
  if (message.includes("UNIQUE constraint failed")) return {status: 409, message: "Este ranking conflita com dados já existentes."};
  if (message.includes("FOREIGN KEY constraint failed")) return {status: 409, message: "Um dos produtos selecionados não existe mais."};
  return null;
}

// The single place that decides what an admin sees for any error thrown
// anywhere in a rankings request's lifecycle. A raw e.message is only ever
// shown when the error is a RankingValidationError we ourselves threw with
// text written to be public — every other case (the auth control-flow
// markers from lib/admin.ts, a JSON parse failure, a SQLite error, a
// TypeError, anything unanticipated) maps to a fixed, generic, safe
// response instead. This is deliberately conservative: a future throw site
// added without RankingValidationError degrades to a safe generic 500
// rather than silently leaking whatever it says.
export function translateRankingError(e: unknown): {status: number; message: string} {
  const message = e instanceof Error ? e.message : "";
  if (message === "UNAUTHORIZED") return {status: 401, message: "Não autorizado"};
  if (message === "FORBIDDEN") return {status: 403, message: "Requisição proibida"};

  if (e instanceof RankingValidationError) {
    return knownConflict(message) ?? {status: 400, message};
  }

  const dbConflict = knownDatabaseConflict(message);
  if (dbConflict) return dbConflict;

  if (e instanceof SyntaxError) return {status: 400, message: "Corpo da requisição inválido."};

  return {status: 500, message: "Não foi possível concluir a operação."};
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(listRankings());
  } catch (e) {
    const {status, message} = translateRankingError(e);
    return NextResponse.json({error: message}, {status});
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
    const {status, message} = translateRankingError(e);
    return NextResponse.json({error: message}, {status});
  }
}
