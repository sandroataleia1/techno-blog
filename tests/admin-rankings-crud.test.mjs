// Real behavioral tests for the ranking editor's core rules — run against
// an actual temporary SQLite database (full migration chain + seed), not
// regex over source text. Same technique established in MVP-1's correction
// pass: "server-only" resolves via the real npm package + the
// --conditions=react-server export condition, and tests/support/alias-hooks.mjs
// (loaded with --experimental-loader — see that file) teaches plain
// `node --test` the "@/" path alias lib/rankings.ts uses internally.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techno-blog-rankings-"));
process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");

// Dynamic imports (not static): DATABASE_PATH must be set before lib/db.ts
// first evaluates (it reads it into a module-level constant).
const {createRanking, deleteRanking, itemsForRanking, listRankings, rankingById, updateRanking} = await import("../lib/rankings.ts");
const {db, closeDatabase} = await import("../lib/db.ts");

// db() runs the full migration chain + seed() on first call — 10 real demo
// products and the "Fones de ouvido" category come out of that for free.
const productIds = db()
  .prepare("SELECT id FROM products ORDER BY position")
  .all()
  .map((r) => r.id);
const categoryId = db().prepare("SELECT id FROM categories WHERE slug='fones-de-ouvido'").get().id;
assert.ok(productIds.length >= 10, "expected the seeded demo catalog to provide at least 10 products for fixtures");

test.after(() => {
  closeDatabase();
  fs.rmSync(tempDir, {recursive: true, force: true});
});

let slugCounter = 0;
function uniqueSlug(base) {
  slugCounter += 1;
  return `${base}-${slugCounter}`;
}
function item(productId, overrides = {}) {
  return {productId, badge: "Selo", reason: "Motivo", mainBenefit: "Benefício", mainLimitation: "Limitação", ...overrides};
}
function itemsFor(ids, overrides = {}) {
  return ids.map((id) => item(id, overrides));
}
function baseInput(overrides = {}) {
  return {
    title: "Ranking de teste",
    slug: uniqueSlug("ranking-teste"),
    categoryId,
    description: null,
    methodology: null,
    status: "draft",
    items: [],
    ...overrides,
  };
}

test("criação de rascunho incompleto: título e categoria bastam, sem produtos e sem descrição/metodologia", () => {
  const r = createRanking(baseInput({items: []}));
  assert.equal(r.status, "draft");
  assert.equal(r.published_at, null);
  assert.equal(itemsForRanking(r.id).length, 0);
});

test("criação de ranking com itens: persiste com posições 1..n", () => {
  const r = createRanking(baseInput({items: itemsFor(productIds.slice(0, 3))}));
  const items = itemsForRanking(r.id);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.position), [1, 2, 3]);
  assert.deepEqual(items.map((i) => i.product_id), productIds.slice(0, 3));
});

test("rejeição de produto duplicado na criação", () => {
  assert.throws(
    () => createRanking(baseInput({items: [item(productIds[0]), item(productIds[0])]})),
    /não pode aparecer mais de uma vez/
  );
});

test("ordenação contínua calculada pelo servidor: posição enviada pelo cliente é ignorada", () => {
  const items = itemsFor(productIds.slice(0, 3)).map((i, idx) => ({...i, position: 999 - idx})); // client-sent garbage position
  const r = createRanking(baseInput({items}));
  assert.deepEqual(itemsForRanking(r.id).map((i) => i.position), [1, 2, 3]);
});

test("reordenação real dos itens: reenviar o array em outra ordem muda a posição persistida", () => {
  const ids = productIds.slice(0, 3);
  const r = createRanking(baseInput({items: itemsFor(ids)}));
  assert.deepEqual(itemsForRanking(r.id).map((i) => i.product_id), ids);

  const reordered = [ids[2], ids[0], ids[1]];
  updateRanking(r.id, baseInput({slug: r.slug, items: itemsFor(reordered)}));
  const after = itemsForRanking(r.id);
  assert.deepEqual(after.map((i) => i.product_id), reordered);
  assert.deepEqual(after.map((i) => i.position), [1, 2, 3]);
});

test("publicação com exatamente 10 produtos válidos: sucesso, published_at preenchido", () => {
  const before = new Date().toISOString();
  const r = createRanking(
    baseInput({
      description: "Introdução do ranking.",
      methodology: "Como avaliamos os produtos.",
      status: "published",
      items: itemsFor(productIds.slice(0, 10)),
    })
  );
  assert.equal(r.status, "published");
  assert.ok(r.published_at && r.published_at >= before, "published_at deve ser preenchido na primeira publicação");
  assert.equal(itemsForRanking(r.id).length, 10);
});

test("rejeição de publicação com 9 ou 11 itens", () => {
  assert.throws(
    () => createRanking(baseInput({description: "d", methodology: "m", status: "published", items: itemsFor(productIds.slice(0, 9))})),
    /exatamente 10/
  );
  // 11 items are rejected even earlier than the publish check: the same
  // "at most 10" rule that bounds a draft already refuses to save it at
  // all, for any status — a stricter, still-correct rejection.
  const elevenIds = [...productIds.slice(0, 10), "produto-inexistente-11"];
  assert.throws(
    () => createRanking(baseInput({description: "d", methodology: "m", status: "published", items: itemsFor(elevenIds)})),
    /no máximo 10/
  );
});

test("rejeição de produto inativo, arquivado ou excluído na publicação", () => {
  // Only 10 seeded products exist in total, so each case mutates a single
  // product at a time (the other 9 stay valid, giving exactly 10 items) and
  // restores it immediately after, rather than permanently sacrificing 3
  // products out of the only 10 available across the rest of this file.
  const conn = db();
  const [badId, ...restIds] = productIds;
  const tenItems = (id) => itemsFor([id, ...restIds]);

  conn.prepare("UPDATE products SET is_active=0 WHERE id=?").run(badId);
  try {
    assert.throws(
      () => createRanking(baseInput({description: "d", methodology: "m", status: "published", items: tenItems(badId)})),
      /inativo/
    );
  } finally {
    conn.prepare("UPDATE products SET is_active=1 WHERE id=?").run(badId);
  }

  conn.prepare("UPDATE products SET status='archived' WHERE id=?").run(badId);
  try {
    assert.throws(
      () => createRanking(baseInput({description: "d", methodology: "m", status: "published", items: tenItems(badId)})),
      /publicado/
    );
  } finally {
    conn.prepare("UPDATE products SET status='published' WHERE id=?").run(badId);
  }

  conn.prepare("UPDATE products SET deleted_at=? WHERE id=?").run(new Date().toISOString(), badId);
  try {
    assert.throws(
      () => createRanking(baseInput({description: "d", methodology: "m", status: "published", items: tenItems(badId)})),
      /não existe mais|excluído/
    );
  } finally {
    conn.prepare("UPDATE products SET deleted_at=NULL WHERE id=?").run(badId);
  }
});

test("slug duplicado é rejeitado na criação", () => {
  const slug = uniqueSlug("slug-unico");
  createRanking(baseInput({slug}));
  assert.throws(() => createRanking(baseInput({slug})), /SLUG_TAKEN/);
});

test("bloqueio da alteração do slug após publicação — atualizar mantendo o mesmo slug continua permitido", () => {
  const r = createRanking(baseInput({description: "d", methodology: "m", status: "published", items: itemsFor(productIds.slice(0, 10))}));
  assert.throws(() => updateRanking(r.id, baseInput({slug: uniqueSlug("outro-slug"), description: "d", methodology: "m", status: "published", items: itemsFor(productIds.slice(0, 10))})), /SLUG_LOCKED/);
  const stillOk = updateRanking(r.id, baseInput({slug: r.slug, description: "d2", methodology: "m", status: "published", items: itemsFor(productIds.slice(0, 10))}));
  assert.equal(stillOk.slug, r.slug);
  assert.equal(stillOk.description, "d2");
});

test("published_at é preenchido somente na primeira publicação — edições posteriores não o alteram", () => {
  const r = createRanking(baseInput({description: "d", methodology: "m", status: "published", items: itemsFor(productIds.slice(0, 10))}));
  const firstPublishedAt = r.published_at;
  // edit while staying published
  const editedStillPublished = updateRanking(r.id, baseInput({slug: r.slug, description: "d editado", methodology: "m", status: "published", items: itemsFor(productIds.slice(0, 10))}));
  assert.equal(editedStillPublished.published_at, firstPublishedAt);
  // toggle to draft and back to published
  updateRanking(r.id, baseInput({slug: r.slug, description: "d", methodology: "m", status: "draft", items: itemsFor(productIds.slice(0, 10))}));
  const republished = updateRanking(r.id, baseInput({slug: r.slug, description: "d", methodology: "m", status: "published", items: itemsFor(productIds.slice(0, 10))}));
  assert.equal(republished.published_at, firstPublishedAt, "republicar não deve trocar a data original de publicação");
});

test("arquivamento preserva published_at", () => {
  const r = createRanking(baseInput({description: "d", methodology: "m", status: "published", items: itemsFor(productIds.slice(0, 10))}));
  const archived = updateRanking(r.id, baseInput({slug: r.slug, description: "d", methodology: "m", status: "archived", items: itemsFor(productIds.slice(0, 10))}));
  assert.equal(archived.status, "archived");
  assert.equal(archived.published_at, r.published_at);
});

test("exclusão de rascunho nunca publicado é permitida e remove os itens junto", () => {
  const r = createRanking(baseInput({items: itemsFor(productIds.slice(0, 2))}));
  const result = deleteRanking(r.id);
  assert.equal(result.ok, true);
  assert.equal(rankingById(r.id), undefined);
  assert.equal(itemsForRanking(r.id).length, 0);
});

test("exclusão de ranking já publicado é bloqueada, mesmo depois de arquivado", () => {
  const r = createRanking(baseInput({description: "d", methodology: "m", status: "published", items: itemsFor(productIds.slice(0, 10))}));
  let result = deleteRanking(r.id);
  assert.equal(result.ok, false);
  assert.ok(rankingById(r.id), "o ranking publicado deve continuar existindo após a tentativa de exclusão");

  updateRanking(r.id, baseInput({slug: r.slug, description: "d", methodology: "m", status: "archived", items: itemsFor(productIds.slice(0, 10))}));
  result = deleteRanking(r.id);
  assert.equal(result.ok, false, "arquivar não reabre a possibilidade de excluir — published_at continua preenchido");
  assert.ok(rankingById(r.id));
});

test("rollback integral: falha no INSERT após remover os itens restaura o ranking anterior por completo", () => {
  const ids = productIds.slice(0, 3);
  const r = createRanking(baseInput({items: itemsFor(ids)}));
  const before = itemsForRanking(r.id);
  assert.equal(before.length, 3);

  // A draft update doesn't check product existence up front (that's a
  // publish-only rule), so this reaches writeItems(): the DELETE of the 3
  // existing items succeeds, then the INSERT for the bogus id trips the
  // ranking_items -> products foreign key, throwing mid-write.
  const badItems = [item(ids[0]), item(ids[1]), item("produto-que-nao-existe")];
  assert.throws(() => updateRanking(r.id, baseInput({slug: r.slug, items: badItems})));

  const after = itemsForRanking(r.id);
  assert.equal(after.length, 3, "o rollback deve restaurar os 3 itens originais, não deixar 0 nem 2");
  assert.deepEqual(after.map((i) => i.product_id).sort(), before.map((i) => i.product_id).sort());
});

test("preservação de um ranking não relacionado durante operações em outros rankings", () => {
  // Stands in for "melhores-fones-mercado-livre" in this isolated test DB:
  // a fully published 10-item ranking that no other test in this file
  // should ever touch.
  const control = createRanking(
    baseInput({slug: uniqueSlug("controle-preservado"), description: "d", methodology: "m", status: "published", items: itemsFor(productIds.slice(0, 10))})
  );
  const controlItemsBefore = itemsForRanking(control.id);

  // Unrelated churn: create, update, reorder, publish, archive, delete other rankings.
  const other = createRanking(baseInput({items: itemsFor(productIds.slice(0, 2))}));
  updateRanking(other.id, baseInput({slug: other.slug, items: itemsFor([productIds[2], productIds[0]])}));
  deleteRanking(other.id);
  createRanking(baseInput({description: "d", methodology: "m", status: "published", items: itemsFor(productIds.slice(0, 10))}));

  const controlAfter = rankingById(control.id);
  const controlItemsAfter = itemsForRanking(control.id);
  assert.deepEqual(controlAfter, control);
  assert.deepEqual(controlItemsAfter, controlItemsBefore);
});

test("nenhum efeito sobre products.position e products.badge ao criar/reordenar/excluir itens de ranking", () => {
  const conn = db();
  const snapshotBefore = conn.prepare("SELECT id,position,badge FROM products WHERE id IN (?,?,?)").all(productIds[0], productIds[1], productIds[2]);

  const r = createRanking(baseInput({items: itemsFor([productIds[0], productIds[1], productIds[2]])}));
  updateRanking(r.id, baseInput({slug: r.slug, items: itemsFor([productIds[2], productIds[1], productIds[0]])}));
  deleteRanking(r.id);

  const snapshotAfter = conn.prepare("SELECT id,position,badge FROM products WHERE id IN (?,?,?)").all(productIds[0], productIds[1], productIds[2]);
  assert.deepEqual(snapshotAfter, snapshotBefore);
});

test("listRankings reflete o estado real do banco (contagem de itens, categoria)", () => {
  const before = listRankings().length;
  createRanking(baseInput({items: itemsFor(productIds.slice(0, 4))}));
  const after = listRankings();
  assert.equal(after.length, before + 1);
  const created = after.find((r) => r.item_count === 4 && r.category_name === "Fones de ouvido");
  assert.ok(created, "o novo ranking deve aparecer na listagem com a contagem de itens e o nome da categoria corretos");
});
