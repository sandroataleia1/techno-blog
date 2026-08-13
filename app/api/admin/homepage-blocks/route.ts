import {NextResponse} from "next/server";
import {requireAdmin, requireAdminMutation} from "@/lib/admin";
import {createHomepageBlock, listHomepageBlocks} from "@/lib/homepage-blocks";
import {HOMEPAGE_BLOCK_CONTENT_MODES, HOMEPAGE_BLOCK_STATUSES, HomepageBlockValidationError, type HomepageBlockContentMode, type HomepageBlockItemInput, type HomepageBlockStatus} from "@/lib/homepage-blocks-rules";

function text(v: unknown, max = 200) {
  return typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null;
}
function str(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}
function int(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}
function parseItems(v: unknown): HomepageBlockItemInput[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      return {linkUrl: str(r.linkUrl), text: str(r.text), imageId: typeof r.imageId === "string" && r.imageId.trim() ? r.imageId.trim() : null};
    })
    .filter((item) => item.linkUrl || item.text || item.imageId);
}

// A malformed body (null, an array, a string, a number...) must never reach
// a `.title`-style property access below — see the identical guard in
// app/api/admin/rankings/route.ts for why this is checked explicitly first.
function assertPlainObject(body: unknown): asserts body is Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HomepageBlockValidationError("Corpo da requisição inválido.");
  }
}

export function validateHomepageBlockBody(body: unknown) {
  assertPlainObject(body);
  const title = text(body.title, 200);
  const contentMode = typeof body.contentMode === "string" && (HOMEPAGE_BLOCK_CONTENT_MODES as readonly string[]).includes(body.contentMode) ? (body.contentMode as HomepageBlockContentMode) : null;
  const columns = int(body.columns);
  const displayOrder = Number.isFinite(int(body.displayOrder)) ? int(body.displayOrder) : 0;
  const status = typeof body.status === "string" && (HOMEPAGE_BLOCK_STATUSES as readonly string[]).includes(body.status) ? (body.status as HomepageBlockStatus) : null;
  const items = parseItems(body.items);
  if (!title) throw new HomepageBlockValidationError("Título é obrigatório.");
  if (!contentMode) throw new HomepageBlockValidationError("Modo de conteúdo inválido.");
  if (!status) throw new HomepageBlockValidationError("Status inválido.");
  return {title, contentMode, columns, displayOrder, status, items};
}

// Known SQLite-level integrity conflicts, same convention as
// knownDatabaseConflict() in app/api/admin/rankings/route.ts.
function knownDatabaseConflict(message: string): {status: number; message: string} | null {
  if (message.includes("UNIQUE constraint failed")) return {status: 409, message: "Este bloco conflita com dados já existentes."};
  if (message.includes("FOREIGN KEY constraint failed")) return {status: 409, message: "Uma das imagens selecionadas não existe mais."};
  return null;
}

// The single place that decides what an admin sees for any error thrown
// anywhere in a homepage-block request's lifecycle — same convention as
// translateRankingError(). A raw e.message is only ever shown when it's a
// HomepageBlockValidationError written to be public; everything else maps
// to a fixed, generic, safe response.
export function translateHomepageBlockError(e: unknown): {status: number; message: string} {
  const message = e instanceof Error ? e.message : "";
  if (message === "UNAUTHORIZED") return {status: 401, message: "Não autorizado"};
  if (message === "FORBIDDEN") return {status: 403, message: "Requisição proibida"};

  if (e instanceof HomepageBlockValidationError) return {status: 400, message};

  const dbConflict = knownDatabaseConflict(message);
  if (dbConflict) return dbConflict;

  if (e instanceof SyntaxError) return {status: 400, message: "Corpo da requisição inválido."};

  return {status: 500, message: "Não foi possível concluir a operação."};
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(listHomepageBlocks());
  } catch (e) {
    const {status, message} = translateHomepageBlockError(e);
    return NextResponse.json({error: message}, {status});
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminMutation(req);
    const body = await req.json();
    const input = validateHomepageBlockBody(body);
    const record = createHomepageBlock(input);
    return NextResponse.json(record, {status: 201});
  } catch (e) {
    const {status, message} = translateHomepageBlockError(e);
    return NextResponse.json({error: message}, {status});
  }
}
