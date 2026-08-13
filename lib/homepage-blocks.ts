import "server-only";
import crypto from "node:crypto";
import {db} from "@/lib/db";
import {
  assignPositions,
  HomepageBlockValidationError,
  isValidColumns,
  isValidLinkUrl,
  validateDraftItems,
  validateItemsForPublish,
  type HomepageBlockContentMode,
  type HomepageBlockItemInput,
  type HomepageBlockStatus,
} from "@/lib/homepage-blocks-rules";

export type DbHomepageBlock = {
  id: string;
  title: string;
  content_mode: HomepageBlockContentMode;
  columns: number;
  display_order: number;
  status: HomepageBlockStatus;
  created_at: string;
  updated_at: string;
};
export type DbHomepageBlockItem = {
  id: string;
  block_id: string;
  position: number;
  image_id: string | null;
  text: string | null;
  link_url: string;
};
export type HomepageBlockWithCounts = DbHomepageBlock & {item_count: number};

export const listHomepageBlocks = (): HomepageBlockWithCounts[] =>
  db()
    .prepare(
      `SELECT b.*, (SELECT count(*) FROM homepage_block_items i WHERE i.block_id=b.id) AS item_count
       FROM homepage_blocks b ORDER BY b.display_order, b.updated_at DESC`
    )
    .all() as HomepageBlockWithCounts[];

export const homepageBlockById = (id: string) => db().prepare("SELECT * FROM homepage_blocks WHERE id=?").get(id) as DbHomepageBlock | undefined;

export const itemsForBlock = (blockId: string): DbHomepageBlockItem[] =>
  db().prepare("SELECT * FROM homepage_block_items WHERE block_id=? ORDER BY position").all(blockId) as DbHomepageBlockItem[];

export type HomepageBlockInput = {
  title: string;
  contentMode: HomepageBlockContentMode;
  columns: number;
  displayOrder: number;
  status: HomepageBlockStatus;
  items: HomepageBlockItemInput[];
};

function assertItemLinksValid(items: HomepageBlockItemInput[]) {
  for (const item of items) {
    if (item.linkUrl && !isValidLinkUrl(item.linkUrl)) throw new HomepageBlockValidationError("Link inválido — use um caminho interno (/algo) ou uma URL https.");
  }
}

// Atomic replace, same convention as writeItems() in lib/rankings.ts: always
// called from inside the caller's conn.transaction().
function writeItems(conn: ReturnType<typeof db>, blockId: string, items: HomepageBlockItemInput[]) {
  conn.prepare("DELETE FROM homepage_block_items WHERE block_id=?").run(blockId);
  const positioned = assignPositions(items);
  const insert = conn.prepare("INSERT INTO homepage_block_items (id,block_id,position,image_id,text,link_url) VALUES (?,?,?,?,?,?)");
  for (const item of positioned) {
    insert.run(crypto.randomUUID(), blockId, item.position, item.imageId || null, item.text || null, item.linkUrl);
  }
}

export function createHomepageBlock(input: HomepageBlockInput): DbHomepageBlock {
  if (!input.title?.trim()) throw new HomepageBlockValidationError("Título é obrigatório.");
  if (!isValidColumns(input.columns)) throw new HomepageBlockValidationError("Número de colunas inválido — escolha entre 1 e 6.");
  const draftError = validateDraftItems(input.items);
  if (draftError) throw new HomepageBlockValidationError(draftError);
  assertItemLinksValid(input.items);
  if (input.status === "published") {
    const publishError = validateItemsForPublish(input.contentMode, input.items);
    if (publishError) throw new HomepageBlockValidationError(publishError);
  }

  const conn = db();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  conn.transaction(() => {
    conn
      .prepare("INSERT INTO homepage_blocks (id,title,content_mode,columns,display_order,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(id, input.title, input.contentMode, input.columns, input.displayOrder, input.status, now, now);
    writeItems(conn, id, input.items);
  })();
  return homepageBlockById(id)!;
}

export function updateHomepageBlock(id: string, input: HomepageBlockInput): DbHomepageBlock | undefined {
  const existing = homepageBlockById(id);
  if (!existing) return undefined;
  if (!input.title?.trim()) throw new HomepageBlockValidationError("Título é obrigatório.");
  if (!isValidColumns(input.columns)) throw new HomepageBlockValidationError("Número de colunas inválido — escolha entre 1 e 6.");
  const draftError = validateDraftItems(input.items);
  if (draftError) throw new HomepageBlockValidationError(draftError);
  assertItemLinksValid(input.items);
  if (input.status === "published") {
    const publishError = validateItemsForPublish(input.contentMode, input.items);
    if (publishError) throw new HomepageBlockValidationError(publishError);
  }

  const conn = db();
  const now = new Date().toISOString();
  conn.transaction(() => {
    conn
      .prepare("UPDATE homepage_blocks SET title=?,content_mode=?,columns=?,display_order=?,status=?,updated_at=? WHERE id=?")
      .run(input.title, input.contentMode, input.columns, input.displayOrder, input.status, now, id);
    writeItems(conn, id, input.items);
  })();
  return homepageBlockById(id);
}

// Same convention as deleteRanking: a block that was ever published keeps a
// stable identity (archive instead of delete) — even though blocks have no
// public URL of their own, this keeps the rule consistent across the admin
// and avoids silently discarding editorial history.
export function deleteHomepageBlock(id: string): {ok: true} | {ok: false; error: string} {
  const existing = homepageBlockById(id);
  if (!existing) return {ok: false, error: "Bloco não encontrado."};
  if (existing.status !== "draft") return {ok: false, error: "Blocos já publicados não podem ser excluídos — arquive em vez de excluir."};
  const conn = db();
  conn.transaction(() => {
    conn.prepare("DELETE FROM homepage_block_items WHERE block_id=?").run(id);
    conn.prepare("DELETE FROM homepage_blocks WHERE id=?").run(id);
  })();
  return {ok: true};
}
