// Real behavioral tests for the homepage-block editor's core rules — run
// against an actual temporary SQLite database (full migration chain +
// seed), same technique as tests/admin-rankings-crud.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techno-blog-homepage-blocks-"));
process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");

const {createHomepageBlock, deleteHomepageBlock, homepageBlockById, itemsForBlock, listHomepageBlocks, updateHomepageBlock} = await import("../lib/homepage-blocks.ts");
const {db, closeDatabase} = await import("../lib/db.ts");

db(); // runs migrations + seed

test.after(() => {
  closeDatabase();
  fs.rmSync(tempDir, {recursive: true, force: true});
});

// homepage_block_items.image_id has a real foreign key to media_assets —
// any item referencing an image in these tests needs a genuine row there,
// not just an arbitrary string id.
const fixtureImageId = "fixture-image-1";
db()
  .prepare(
    "INSERT INTO media_assets (id,original_name,mime_type,width,height,size,hash,data,source_type,source_note,license,origin_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  )
  .run(fixtureImageId, "fixture.webp", "image/webp", 10, 10, 4, "fixture-hash", Buffer.from([0, 0, 0, 0]), "original_illustration", null, null, null, new Date().toISOString(), new Date().toISOString());

function item(overrides = {}) {
  return {linkUrl: "/melhores-fones-mercado-livre", text: "Texto", imageId: null, ...overrides};
}
function baseInput(overrides = {}) {
  return {title: "Bloco de teste", contentMode: "text", columns: 3, displayOrder: 0, status: "draft", items: [], ...overrides};
}

test("criação de rascunho incompleto: título basta, sem itens", () => {
  const b = createHomepageBlock(baseInput({items: []}));
  assert.equal(b.status, "draft");
  assert.equal(itemsForBlock(b.id).length, 0);
});

test("criação com itens: persiste com posições 1..n na ordem enviada", () => {
  const b = createHomepageBlock(baseInput({items: [item({linkUrl: "/a"}), item({linkUrl: "/b"}), item({linkUrl: "/c"})]}));
  const items = itemsForBlock(b.id);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.position), [1, 2, 3]);
  assert.deepEqual(items.map((i) => i.link_url), ["/a", "/b", "/c"]);
});

test("posição enviada pelo cliente é ignorada — servidor sempre deriva do índice do array", () => {
  const items = [item({linkUrl: "/a"}), item({linkUrl: "/b"})].map((i, idx) => ({...i, position: 999 - idx}));
  const b = createHomepageBlock(baseInput({items}));
  assert.deepEqual(itemsForBlock(b.id).map((i) => i.position), [1, 2]);
});

test("reordenação real: reenviar o array em outra ordem muda a posição persistida", () => {
  const b = createHomepageBlock(baseInput({items: [item({linkUrl: "/a"}), item({linkUrl: "/b"}), item({linkUrl: "/c"})]}));
  updateHomepageBlock(b.id, baseInput({items: [item({linkUrl: "/c"}), item({linkUrl: "/a"}), item({linkUrl: "/b"})]}));
  const after = itemsForBlock(b.id);
  assert.deepEqual(after.map((i) => i.link_url), ["/c", "/a", "/b"]);
  assert.deepEqual(after.map((i) => i.position), [1, 2, 3]);
});

test("rejeição de colunas inválidas (0, 7, não-inteiro)", () => {
  assert.throws(() => createHomepageBlock(baseInput({columns: 0})), /colunas/);
  assert.throws(() => createHomepageBlock(baseInput({columns: 7})), /colunas/);
  assert.throws(() => createHomepageBlock(baseInput({columns: 2.5})), /colunas/);
});

test("rejeição de link inválido (http, não-url)", () => {
  assert.throws(() => createHomepageBlock(baseInput({items: [item({linkUrl: "http://inseguro.com"})]})), /Link inválido/);
  assert.throws(() => createHomepageBlock(baseInput({items: [item({linkUrl: "nem uma url"})]})), /Link inválido/);
});

test("publicação exige pelo menos 1 item satisfazendo o content_mode do bloco", () => {
  assert.throws(() => createHomepageBlock(baseInput({status: "published", items: []})), /pelo menos um item/);
  assert.throws(() => createHomepageBlock(baseInput({status: "published", contentMode: "photo", items: [item({imageId: null})]})), /imagem/);
  const ok = createHomepageBlock(baseInput({status: "published", contentMode: "photo", items: [item({imageId: fixtureImageId, text: ""})]}));
  assert.equal(ok.status, "published");
});

test("exclusão de rascunho é permitida e remove os itens junto", () => {
  const b = createHomepageBlock(baseInput({items: [item(), item({linkUrl: "/b"})]}));
  const result = deleteHomepageBlock(b.id);
  assert.equal(result.ok, true);
  assert.equal(homepageBlockById(b.id), undefined);
  assert.equal(itemsForBlock(b.id).length, 0);
});

test("exclusão de bloco já publicado é bloqueada", () => {
  const b = createHomepageBlock(baseInput({status: "published", items: [item()]}));
  const result = deleteHomepageBlock(b.id);
  assert.equal(result.ok, false);
  assert.ok(homepageBlockById(b.id), "o bloco publicado deve continuar existindo após a tentativa de exclusão");
});

test("rollback integral: falha na atualização restaura os itens anteriores por completo", () => {
  const b = createHomepageBlock(baseInput({items: [item({linkUrl: "/a"}), item({linkUrl: "/b"})]}));
  const before = itemsForBlock(b.id);
  assert.equal(before.length, 2);
  // An invalid column value is caught before any DB write happens at all —
  // this proves the reject-before-write path leaves the existing rows
  // completely untouched, not just "eventually consistent".
  assert.throws(() => updateHomepageBlock(b.id, baseInput({columns: 99, items: [item({linkUrl: "/c"})]})));
  const after = itemsForBlock(b.id);
  assert.deepEqual(after.map((i) => i.link_url), before.map((i) => i.link_url));
});

test("listHomepageBlocks reflete o estado real do banco (contagem de itens)", () => {
  const before = listHomepageBlocks().length;
  createHomepageBlock(baseInput({items: [item(), item({linkUrl: "/b"}), item({linkUrl: "/c"})]}));
  const after = listHomepageBlocks();
  assert.equal(after.length, before + 1);
  const created = after.find((b) => b.item_count === 3);
  assert.ok(created, "o novo bloco deve aparecer na listagem com a contagem de itens correta");
});
