// Real behavioral tests for the public homepage-blocks projection — run
// against an actual temporary SQLite database, same technique as
// tests/public-rankings.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techno-blog-public-homepage-blocks-"));
process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");

const {listPublishedHomepageBlocks} = await import("../lib/public-homepage-blocks.ts");
const {createHomepageBlock} = await import("../lib/homepage-blocks.ts");
const {db, closeDatabase} = await import("../lib/db.ts");

db(); // runs migrations + seed

test.after(() => {
  closeDatabase();
  fs.rmSync(tempDir, {recursive: true, force: true});
});

// homepage_block_items.image_id has a real foreign key to media_assets —
// any item referencing an image in these tests needs a genuine row there.
function insertFixtureImage(id) {
  const now = new Date().toISOString();
  db()
    .prepare(
      "INSERT INTO media_assets (id,original_name,mime_type,width,height,size,hash,data,source_type,source_note,license,origin_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    )
    .run(id, "fixture.webp", "image/webp", 10, 10, 4, `fixture-hash-${id}`, Buffer.from([0, 0, 0, 0]), "original_illustration", null, null, null, now, now);
}

function item(overrides = {}) {
  return {linkUrl: "/melhores-fones-mercado-livre", text: "Texto", imageId: null, ...overrides};
}

test("bloco em rascunho nunca aparece na home, mesmo com itens válidos", () => {
  createHomepageBlock({title: "Rascunho", contentMode: "text", columns: 3, displayOrder: 0, status: "draft", items: [item()]});
  const result = listPublishedHomepageBlocks();
  assert.ok(!result.some((b) => b.title === "Rascunho"));
});

test("bloco publicado sem nenhum item nunca aparece na home (dado corrompido: publicado, mas 0 itens)", () => {
  // Direct DB manipulation bypasses createHomepageBlock's own publish-time
  // validation, simulating a row that became inconsistent some other way
  // (e.g. a manual edit) — the public read path must fail closed regardless.
  const conn = db();
  const id = "corrupt-empty-block";
  const now = new Date().toISOString();
  conn.prepare("INSERT INTO homepage_blocks (id,title,content_mode,columns,display_order,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(id, "Publicado vazio", "text", 3, 0, "published", now, now);
  const result = listPublishedHomepageBlocks();
  assert.ok(!result.some((b) => b.id === id));
});

test('bloco publicado no modo "photo" com item sem imagem nunca aparece na home', () => {
  const conn = db();
  const id = "corrupt-photo-block";
  const now = new Date().toISOString();
  conn.prepare("INSERT INTO homepage_blocks (id,title,content_mode,columns,display_order,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(id, "Foto sem imagem", "photo", 3, 0, "published", now, now);
  conn.prepare("INSERT INTO homepage_block_items (id,block_id,position,image_id,text,link_url) VALUES (?,?,?,?,?,?)").run("item-1", id, 1, null, null, "/x");
  const result = listPublishedHomepageBlocks();
  assert.ok(!result.some((b) => b.id === id));
});

test("bloco publicado válido aparece com os itens na ordem certa e URL de imagem pronta", () => {
  insertFixtureImage("img-a");
  insertFixtureImage("img-b");
  const b = createHomepageBlock({
    title: "Ofertas de notebooks",
    contentMode: "both",
    columns: 4,
    displayOrder: 5,
    status: "published",
    items: [item({linkUrl: "/a", text: "A", imageId: "img-a"}), item({linkUrl: "/b", text: "B", imageId: "img-b"})],
  });
  const result = listPublishedHomepageBlocks();
  const found = result.find((r) => r.id === b.id);
  assert.ok(found, "o bloco publicado e válido deve aparecer na listagem pública");
  assert.equal(found.title, "Ofertas de notebooks");
  assert.equal(found.columns, 4);
  assert.deepEqual(found.items.map((i) => i.linkUrl), ["/a", "/b"]);
  assert.deepEqual(found.items.map((i) => i.imageUrl), ["/api/media/img-a", "/api/media/img-b"]);
});

test("ordem dos blocos publicados segue display_order", () => {
  createHomepageBlock({title: "Segundo", contentMode: "text", columns: 2, displayOrder: 20, status: "published", items: [item()]});
  createHomepageBlock({title: "Primeiro", contentMode: "text", columns: 2, displayOrder: 10, status: "published", items: [item()]});
  const result = listPublishedHomepageBlocks();
  const titles = result.map((b) => b.title).filter((t) => t === "Primeiro" || t === "Segundo");
  assert.deepEqual(titles, ["Primeiro", "Segundo"]);
});

test("bloco arquivado nunca aparece na home", () => {
  createHomepageBlock({title: "Arquivado", contentMode: "text", columns: 2, displayOrder: 0, status: "draft", items: [item()]});
  const conn = db();
  conn.prepare("UPDATE homepage_blocks SET status='archived' WHERE title='Arquivado'").run();
  const result = listPublishedHomepageBlocks();
  assert.ok(!result.some((b) => b.title === "Arquivado"));
});
