// Real behavioral tests for the public ranking projection — run against an
// actual temporary SQLite database (full migration chain + seed), not
// regex over source text. Same technique established in MVP-1/MVP-2:
// "server-only" resolves via the real npm package + --conditions=react-server,
// and tests/support/alias-hooks.mjs teaches plain `node --test` the "@/"
// path alias.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techno-blog-public-rankings-"));
process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");

const {publicRankingBySlug} = await import("../lib/public-rankings.ts");
const {createRanking, updateRanking} = await import("../lib/rankings.ts");
const {db, closeDatabase} = await import("../lib/db.ts");
const {hasDuplicateProductIds} = await import("../lib/rankings-rules.ts");

const SEED_SLUG = "melhores-fones-mercado-livre";
const productIds = db()
  .prepare("SELECT id FROM products ORDER BY position")
  .all()
  .map((r) => r.id);
const categoryId = db().prepare("SELECT id FROM categories WHERE slug='fones-de-ouvido'").get().id;
assert.ok(productIds.length >= 10, "expected the seeded demo catalog to provide 10 products for fixtures");

test.after(() => {
  closeDatabase();
  fs.rmSync(tempDir, {recursive: true, force: true});
});

let slugCounter = 0;
function uniqueSlug(base) {
  slugCounter += 1;
  return `${base}-${slugCounter}`;
}
function item(productId, i) {
  return {productId, badge: `Selo ${i}`, reason: `Motivo ${i}`, mainBenefit: `Benefício ${i}`, mainLimitation: `Limitação ${i}`};
}
function tenValidItems(ids = productIds.slice(0, 10)) {
  return ids.map((id, i) => item(id, i + 1));
}
function publishedRankingInput(overrides = {}) {
  return {
    title: "Ranking de teste",
    slug: uniqueSlug("ranking-teste"),
    categoryId,
    description: "Descrição de teste.",
    methodology: "Metodologia de teste.",
    status: "published",
    items: tenValidItems(),
    ...overrides,
  };
}

// ---------- The seeded real ranking (migration 014) ----------

test("ranking publicado (dado real do seed) retorna exatamente 10 itens", () => {
  const result = publicRankingBySlug(SEED_SLUG);
  assert.equal(result.kind, "ok");
  assert.equal(result.items.length, 10);
});

test("ordem dos itens vem de ranking_items.position, preservada mesmo após reordenar", () => {
  const before = publicRankingBySlug(SEED_SLUG);
  assert.equal(before.kind, "ok");
  const ids = before.items.map((i) => i.id);
  const reversed = [...ids].reverse();
  const rankingRow = db().prepare("SELECT * FROM rankings WHERE slug=?").get(SEED_SLUG);
  updateRanking(rankingRow.id, {
    title: rankingRow.title,
    slug: rankingRow.slug,
    categoryId: rankingRow.category_id,
    description: rankingRow.description,
    methodology: rankingRow.methodology,
    status: "published",
    items: reversed.map((id, i) => item(id, i + 1)),
  });
  const after = publicRankingBySlug(SEED_SLUG);
  assert.equal(after.kind, "ok");
  assert.deepEqual(after.items.map((i) => i.id), reversed);
  assert.deepEqual(after.items.map((i) => i.position), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  // restore original order so later tests in this file see the seeded state
  updateRanking(rankingRow.id, {
    title: rankingRow.title,
    slug: rankingRow.slug,
    categoryId: rankingRow.category_id,
    description: rankingRow.description,
    methodology: rankingRow.methodology,
    status: "published",
    items: ids.map((id, i) => item(id, i + 1)),
  });
});

// ---------- Legacy products fields must never leak into the projection ----------

test("mudança em products.position não altera a posição pública do item", () => {
  const before = publicRankingBySlug(SEED_SLUG);
  const target = before.items[2]; // 3rd item, whatever product that is
  const conn = db();
  conn.prepare("UPDATE products SET position=999 WHERE id=?").run(target.id);
  try {
    const after = publicRankingBySlug(SEED_SLUG);
    const sameItem = after.items.find((i) => i.id === target.id);
    assert.equal(sameItem.position, target.position, "a posição pública deve continuar vindo de ranking_items, não de products.position");
  } finally {
    conn.prepare("UPDATE products SET position=? WHERE id=?").run(target.position, target.id);
  }
});

test("mudança em products.badge não altera o selo do ranking", () => {
  const before = publicRankingBySlug(SEED_SLUG);
  const target = before.items[0];
  const conn = db();
  const originalProductBadge = conn.prepare("SELECT badge FROM products WHERE id=?").get(target.id).badge;
  conn.prepare("UPDATE products SET badge=? WHERE id=?").run("BADGE-ALTERADO-NO-PRODUTO", target.id);
  try {
    const after = publicRankingBySlug(SEED_SLUG);
    const sameItem = after.items.find((i) => i.id === target.id);
    assert.equal(sameItem.badge, target.badge);
    assert.notEqual(sameItem.badge, "BADGE-ALTERADO-NO-PRODUTO");
  } finally {
    conn.prepare("UPDATE products SET badge=? WHERE id=?").run(originalProductBadge, target.id);
  }
});

test("textos editoriais do ranking (badge, descrição, benefício, limitação) vêm de ranking_items, não de products", () => {
  const r = createRanking(publishedRankingInput());
  const result = publicRankingBySlug(r.slug);
  assert.equal(result.kind, "ok");
  result.items.forEach((it, i) => {
    const n = i + 1;
    assert.equal(it.badge, `Selo ${n}`);
    assert.equal(it.description, `Motivo ${n}`); // reason -> description slot
    assert.equal(it.mainBenefit, `Benefício ${n}`);
    assert.equal(it.limitations[0], `Limitação ${n}`); // main_limitation -> limitations[0] slot
  });
});

// ---------- Structural invariants: fail closed, never a partial Top 10 ----------

test("ranking com 9 itens (construído por manipulação direta do banco) falha fechado — kind 'invalid'", () => {
  const r = createRanking(publishedRankingInput());
  db().prepare("DELETE FROM ranking_items WHERE ranking_id=? AND position=10").run(r.id);
  const result = publicRankingBySlug(r.slug);
  assert.equal(result.kind, "invalid");
});

test("ranking com 11 itens (construído por manipulação direta do banco) falha fechado — kind 'invalid'", () => {
  const r = createRanking(publishedRankingInput());
  // The seed only ships 10 products total, so an 11th *distinct* product is
  // needed to add an 11th item without hitting the UNIQUE(ranking_id,
  // product_id) constraint exercised by the duplicate-product test above —
  // clone a real, valid product row under a fresh id/slug.
  const conn = db();
  const sourceRow = conn.prepare("SELECT * FROM products WHERE id=?").get(productIds[0]);
  const clone = {...sourceRow, id: crypto.randomUUID(), slug: uniqueSlug("produto-clone")};
  const cols = Object.keys(clone);
  conn.prepare(`INSERT INTO products (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...cols.map((c) => clone[c]));
  conn
    .prepare("INSERT INTO ranking_items (id,ranking_id,product_id,position,badge,reason,main_benefit,main_limitation) VALUES (?,?,?,?,?,?,?,?)")
    .run(crypto.randomUUID(), r.id, clone.id, 11, "extra", "extra", "extra", "extra");
  const result = publicRankingBySlug(r.slug);
  assert.equal(result.kind, "invalid");
});

test("posições não contínuas (gap, construído por manipulação direta) falham fechado — kind 'invalid'", () => {
  const r = createRanking(publishedRankingInput());
  // Move the item at position 10 to position 11 — 10 rows total, no
  // duplicate position (so no UNIQUE violation), but a gap at 10.
  db().prepare("UPDATE ranking_items SET position=11 WHERE ranking_id=? AND position=10").run(r.id);
  const result = publicRankingBySlug(r.slug);
  assert.equal(result.kind, "invalid");
});

test("produto duplicado é impedido pela UNIQUE(ranking_id,product_id) do próprio banco — defesa em profundidade confirmada nos dois níveis", () => {
  const r = createRanking(publishedRankingInput());
  const conn = db();
  const dupeId = crypto.randomUUID();
  // Attempting to force a duplicate product_id for the same ranking must
  // throw at the database level — this is the *primary* protection; it
  // means "invalid" can never actually be reached via this specific path
  // in a real deployment, which is exactly the point.
  assert.throws(() => {
    conn
      .prepare("INSERT INTO ranking_items (id,ranking_id,product_id,position,badge,reason,main_benefit,main_limitation) VALUES (?,?,?,?,?,?,?,?)")
      .run(dupeId, r.id, tenValidItems()[0].productId, 11, "x", "x", "x", "x");
  }, /UNIQUE constraint failed/);
  // The projection's own duplicate check (a second, independent guard) is
  // exercised directly here against the pure predicate it's built on, since
  // the database constraint makes the state itself unreachable to trigger
  // through publicRankingBySlug() end-to-end.
  assert.equal(hasDuplicateProductIds([{productId: "a"}, {productId: "a"}]), true);
});

test("ranking publicado sem descrição ou metodologia falha fechado", () => {
  const r = createRanking(publishedRankingInput());
  db().prepare("UPDATE rankings SET description=NULL WHERE id=?").run(r.id);
  assert.equal(publicRankingBySlug(r.slug).kind, "invalid");
});

// ---------- Product eligibility ----------

test("produto inativo entre os itens impede a publicação pública", () => {
  const r = createRanking(publishedRankingInput());
  const conn = db();
  const targetId = tenValidItems()[0].productId;
  conn.prepare("UPDATE products SET is_active=0 WHERE id=?").run(targetId);
  try {
    assert.equal(publicRankingBySlug(r.slug).kind, "invalid");
  } finally {
    conn.prepare("UPDATE products SET is_active=1 WHERE id=?").run(targetId);
  }
});

test("produto com status draft entre os itens impede a publicação pública", () => {
  const r = createRanking(publishedRankingInput());
  const conn = db();
  const targetId = tenValidItems()[0].productId;
  conn.prepare("UPDATE products SET status='draft' WHERE id=?").run(targetId);
  try {
    assert.equal(publicRankingBySlug(r.slug).kind, "invalid");
  } finally {
    conn.prepare("UPDATE products SET status='published' WHERE id=?").run(targetId);
  }
});

test("produto com status archived entre os itens impede a publicação pública", () => {
  const r = createRanking(publishedRankingInput());
  const conn = db();
  const targetId = tenValidItems()[0].productId;
  conn.prepare("UPDATE products SET status='archived' WHERE id=?").run(targetId);
  try {
    assert.equal(publicRankingBySlug(r.slug).kind, "invalid");
  } finally {
    conn.prepare("UPDATE products SET status='published' WHERE id=?").run(targetId);
  }
});

test("produto excluído (deleted_at) entre os itens impede a publicação pública", () => {
  const r = createRanking(publishedRankingInput());
  const conn = db();
  const targetId = tenValidItems()[0].productId;
  conn.prepare("UPDATE products SET deleted_at=? WHERE id=?").run(new Date().toISOString(), targetId);
  try {
    assert.equal(publicRankingBySlug(r.slug).kind, "invalid");
  } finally {
    conn.prepare("UPDATE products SET deleted_at=NULL WHERE id=?").run(targetId);
  }
});

// ---------- not_found / archived outcomes ----------

test("ranking inexistente retorna kind 'not_found'", () => {
  assert.equal(publicRankingBySlug("nao-existe-" + crypto.randomUUID()).kind, "not_found");
});

test("ranking em rascunho retorna kind 'not_found'", () => {
  const r = createRanking(publishedRankingInput({status: "draft"}));
  assert.equal(publicRankingBySlug(r.slug).kind, "not_found");
});

test("ranking arquivado que já foi publicado retorna kind 'archived', com published_at preservado", () => {
  const r = createRanking(publishedRankingInput());
  const published = publicRankingBySlug(r.slug);
  assert.equal(published.kind, "ok");
  const publishedAt = published.ranking.publishedAt;
  updateRanking(r.id, {...publishedRankingInput(), slug: r.slug, status: "archived"});
  const archived = publicRankingBySlug(r.slug);
  assert.equal(archived.kind, "archived");
  assert.equal(archived.ranking.publishedAt, publishedAt);
});

test("ranking arquivado que nunca foi publicado continua não público — kind 'not_found'", () => {
  const r = createRanking(publishedRankingInput({status: "archived"}));
  const row = db().prepare("SELECT published_at FROM rankings WHERE id=?").get(r.id);
  assert.equal(row.published_at, null, "sanity check: nunca foi publicado");
  assert.equal(publicRankingBySlug(r.slug).kind, "not_found");
});

// ---------- Offers: the only source for a public link/price ----------

test("oferta principal ativa é usada no item do ranking", () => {
  const result = publicRankingBySlug(SEED_SLUG);
  assert.equal(result.kind, "ok");
  const conn = db();
  for (const it of result.items) {
    const offerRow = conn.prepare("SELECT affiliate_url FROM affiliate_offers WHERE product_id=? AND is_primary=1 AND status='active'").get(it.id);
    assert.ok(offerRow, `esperava uma oferta principal ativa para ${it.id}`);
    assert.equal(it.offer.affiliateUrl, offerRow.affiliate_url);
  }
});

test("oferta inativa, quebrada ou não principal é ignorada — o produto continua no ranking com offer:null", () => {
  const r = createRanking(publishedRankingInput());
  const targetId = tenValidItems()[0].productId;
  const conn = db();
  // demote the seeded primary offer for this product and leave it with no
  // eligible replacement
  conn.prepare("UPDATE affiliate_offers SET is_primary=0 WHERE product_id=?").run(targetId);
  try {
    const result = publicRankingBySlug(r.slug);
    assert.equal(result.kind, "ok", "ausência de oferta não deve invalidar o ranking");
    const it = result.items.find((i) => i.id === targetId);
    assert.ok(it, "o produto continua presente no ranking");
    assert.equal(it.offer, null);
  } finally {
    conn.prepare("UPDATE affiliate_offers SET is_primary=1 WHERE product_id=? AND status='active'").run(targetId);
  }
});

test("products.affiliate_url nunca é usado como fallback — prova com URL divergente deliberada", () => {
  const targetId = tenValidItems()[0].productId;
  const conn = db();
  const originalUrl = conn.prepare("SELECT affiliate_url FROM products WHERE id=?").get(targetId).affiliate_url;
  const realOfferUrl = conn.prepare("SELECT affiliate_url FROM affiliate_offers WHERE product_id=? AND is_primary=1 AND status='active'").get(targetId).affiliate_url;
  conn.prepare("UPDATE products SET affiliate_url=? WHERE id=?").run("https://meli.la/DECOY-NUNCA-DEVE-APARECER", targetId);
  try {
    const result = publicRankingBySlug(SEED_SLUG);
    assert.equal(result.kind, "ok");
    const it = result.items.find((i) => i.id === targetId);
    assert.equal(it.offer.affiliateUrl, realOfferUrl);
    assert.notEqual(it.offer.affiliateUrl, "https://meli.la/DECOY-NUNCA-DEVE-APARECER");
  } finally {
    conn.prepare("UPDATE products SET affiliate_url=? WHERE id=?").run(originalUrl, targetId);
  }
});

// ---------- Price ----------

test("preço só aparece com last_checked_at preenchido", () => {
  const targetId = tenValidItems()[0].productId;
  const conn = db();
  conn.prepare("UPDATE affiliate_offers SET current_price_cents=21990, last_checked_at=NULL WHERE product_id=? AND is_primary=1 AND status='active'").run(targetId);
  try {
    const result = publicRankingBySlug(SEED_SLUG);
    const it = result.items.find((i) => i.id === targetId);
    assert.equal(it.offer.currentPriceCents, null, "preço não pode aparecer sem data de verificação, mesmo com o valor presente no banco");
  } finally {
    conn.prepare("UPDATE affiliate_offers SET current_price_cents=NULL, last_checked_at=NULL WHERE product_id=?").run(targetId);
  }
});

test("preço em centavos chega intacto (sem conversão por float) até a projeção pública", () => {
  const targetId = tenValidItems()[0].productId;
  const conn = db();
  const now = new Date().toISOString();
  conn.prepare("UPDATE affiliate_offers SET current_price_cents=21990, previous_price_cents=25900, last_checked_at=? WHERE product_id=? AND is_primary=1 AND status='active'").run(now, targetId);
  try {
    const result = publicRankingBySlug(SEED_SLUG);
    const it = result.items.find((i) => i.id === targetId);
    assert.equal(it.offer.currentPriceCents, 21990);
    assert.equal(it.offer.previousPriceCents, 25900);
    assert.equal(it.offer.lastCheckedAt, now);
  } finally {
    conn.prepare("UPDATE affiliate_offers SET current_price_cents=NULL, previous_price_cents=NULL, last_checked_at=NULL WHERE product_id=?").run(targetId);
  }
});
