// Real HTTP/HTML behavioral tests for the public ranking page and its
// surrounding surfaces (sitemap, JSON-LD, affiliate link attributes). Same
// technique as tests/admin-rankings-http.test.mjs: spawn a real `next dev`
// server against an isolated temporary database and drive it with real
// fetch() calls — this is the only way to prove what actually ships as
// HTML/HTTP status/metadata, as opposed to what the source code merely
// intends to produce.
//
// No admin login is needed here: every scenario below (draft, archived,
// decoy URLs, leaked internal fields) is reached by flipping columns on the
// seed's own already-valid "melhores-fones-mercado-livre" ranking directly
// via a raw sqlite connection, then restoring them — the public route only
// ever reads that one fixed slug (see app/melhores-fones-mercado-livre/page.tsx),
// so there is no separate fixture ranking to create or clean up.
import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const PROJECT_ROOT = path.join(import.meta.dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techno-blog-public-ranking-http-"));
const dbPath = path.join(tempDir, "test.sqlite");

let serverProcess;
let baseUrl;
let productIds;
let rankingId;

function rawDb() {
  return new Database(dbPath);
}

test.before(async () => {
  serverProcess = spawn(
    process.execPath,
    [path.join(PROJECT_ROOT, "node_modules/next/dist/bin/next"), "dev", "--port", "0"],
    {
      cwd: PROJECT_ROOT,
      env: {...process.env, DATABASE_PATH: dbPath},
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  baseUrl = await new Promise((resolve, reject) => {
    let out = "";
    const timeout = setTimeout(() => reject(new Error(`timeout waiting for dev server to start. Output so far:\n${out}`)), 45000);
    const onData = (chunk) => {
      out += chunk.toString();
      const match = out.match(/Local:\s+(http:\/\/localhost:\d+)/);
      if (match && /Ready in/.test(out)) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    };
    serverProcess.stdout.on("data", onData);
    serverProcess.stderr.on("data", onData);
    serverProcess.on("error", reject);
    serverProcess.on("exit", (code) => reject(new Error(`dev server exited early with code ${code}. Output:\n${out}`)));
  });

  // Nothing touches the sqlite file until a route actually queries
  // something — this GET forces the server's own db() to run its full
  // migration+seed chain before the raw connection below opens the file.
  const warmupRes = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
  assert.equal(warmupRes.status, 200, "setup: the seeded ranking must be publicly reachable to initialize the database file");

  const conn = rawDb();
  productIds = conn.prepare("SELECT id FROM products ORDER BY position").all().map((r) => r.id);
  rankingId = conn.prepare("SELECT id FROM rankings WHERE slug='melhores-fones-mercado-livre'").get().id;
  conn.close();
});

test.after(async () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    await new Promise((resolve) => {
      serverProcess.once("exit", resolve);
      setTimeout(resolve, 5000);
    });
  }
  try {
    fs.rmSync(tempDir, {recursive: true, force: true});
  } catch {
    // best-effort cleanup, matches the equivalent note in admin-offers-price-migration.test.mjs
  }
});

// ---------- The real seeded ranking: happy path ----------

test("GET /melhores-fones-mercado-livre com o ranking do seed -> 200, título e descrição reais no HTML", async () => {
  const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
  assert.equal(res.status, 200);
  const html = await res.text();
  const conn = rawDb();
  const ranking = conn.prepare("SELECT * FROM rankings WHERE id=?").get(rankingId);
  conn.close();
  assert.ok(html.includes(ranking.title));
  assert.ok(html.includes(ranking.description));
});

test("metadata (title/description) usa o título e a descrição reais do ranking", async () => {
  const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
  const html = await res.text();
  const conn = rawDb();
  const ranking = conn.prepare("SELECT * FROM rankings WHERE id=?").get(rankingId);
  conn.close();
  assert.match(html, new RegExp(`<title>${ranking.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.ok(html.includes(`content="${ranking.description}"`));
});

test("canonical alternates aponta para a URL atual, sem novas rotas", async () => {
  const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
  const html = await res.text();
  assert.match(html, /rel="canonical"[^>]*href="[^"]*\/melhores-fones-mercado-livre"/);
});

test("JSON-LD contém exatamente 10 itens, na ordem real de ranking_items.position, linkando /fones/[slug]", async () => {
  const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
  const html = await res.text();
  const match = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  assert.ok(match, "esperava um bloco JSON-LD na página");
  const jsonLd = JSON.parse(match[1]);
  const itemList = jsonLd["@graph"].find((n) => n["@type"] === "ItemList");
  assert.ok(itemList);
  assert.equal(itemList.numberOfItems, 10);
  assert.equal(itemList.itemListElement.length, 10);
  assert.deepEqual(itemList.itemListElement.map((i) => i.position), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  const conn = rawDb();
  const realOrder = conn
    .prepare("SELECT ri.position, p.slug FROM ranking_items ri JOIN products p ON p.id=ri.product_id WHERE ri.ranking_id=? ORDER BY ri.position")
    .all(rankingId);
  conn.close();
  const linkSlugs = itemList.itemListElement.map((i) => i.url.split("/fones/")[1]);
  assert.deepEqual(linkSlugs, realOrder.map((r) => r.slug));

  const article = jsonLd["@graph"].find((n) => n["@type"] === "Article");
  const connRanking = rawDb();
  const ranking = connRanking.prepare("SELECT * FROM rankings WHERE id=?").get(rankingId);
  connRanking.close();
  assert.equal(article.headline, ranking.title);
  assert.equal(article.description, ranking.description);
  assert.equal(article.datePublished, ranking.published_at);
});

test("links afiliados no HTML público carregam rel=sponsored nofollow noopener e target=_blank", async () => {
  const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
  const html = await res.text();
  assert.match(html, /class="cta ml"[^>]*target="_blank"[^>]*rel="sponsored nofollow noopener"/);
});

test("internal_note e original_product_url nunca aparecem no HTML público", async () => {
  const conn = rawDb();
  const productId = productIds[0];
  conn.prepare("UPDATE affiliate_offers SET internal_note=?, original_product_url=? WHERE product_id=? AND is_primary=1").run(
    "NOTA-INTERNA-NUNCA-DEVE-VAZAR",
    "https://mercadolivre.com.br/ORIGINAL-NUNCA-DEVE-VAZAR",
    productId
  );
  try {
    const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
    const html = await res.text();
    assert.doesNotMatch(html, /NOTA-INTERNA-NUNCA-DEVE-VAZAR/);
    assert.doesNotMatch(html, /ORIGINAL-NUNCA-DEVE-VAZAR/);
  } finally {
    conn.prepare("UPDATE affiliate_offers SET internal_note=NULL, original_product_url=NULL WHERE product_id=?").run(productId);
    conn.close();
  }
});

test("produto sem oferta continua visível, com indicação discreta, sem href vazio", async () => {
  const conn = rawDb();
  const productId = productIds[1];
  conn.prepare("UPDATE affiliate_offers SET is_primary=0 WHERE product_id=?").run(productId);
  try {
    const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
    const html = await res.text();
    assert.match(html, /Oferta indisponível no momento/);
    assert.doesNotMatch(html, /class="cta ml" href=""/);
  } finally {
    conn.prepare("UPDATE affiliate_offers SET is_primary=1 WHERE product_id=? AND status='active'").run(productId);
    conn.close();
  }
});

test("card com preço mostra valor formatado e a data de verificação; anterior só quando maior", async () => {
  const conn = rawDb();
  const productId = productIds[2];
  const now = new Date().toISOString();
  conn.prepare("UPDATE affiliate_offers SET current_price_cents=21990, previous_price_cents=25900, last_checked_at=? WHERE product_id=? AND is_primary=1").run(now, productId);
  try {
    const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
    const html = await res.text();
    assert.match(html, /R\$\s?219,90/);
    assert.match(html, /R\$\s?259,00/);
    assert.match(html, /Conferido em/);
  } finally {
    conn.prepare("UPDATE affiliate_offers SET current_price_cents=NULL, previous_price_cents=NULL, last_checked_at=NULL WHERE product_id=?").run(productId);
    conn.close();
  }
});

// ---------- The mandatory false-positive proof ----------

test("PROVA OBRIGATÓRIA: products.affiliate_url divergente nunca aparece — só a URL da oferta aparece no HTML público", async () => {
  const conn = rawDb();
  const productId = productIds[0];
  const originalUrl = conn.prepare("SELECT affiliate_url FROM products WHERE id=?").get(productId).affiliate_url;
  const realOfferUrl = conn.prepare("SELECT affiliate_url FROM affiliate_offers WHERE product_id=? AND is_primary=1 AND status='active'").get(productId).affiliate_url;
  const decoyUrl = "https://meli.la/DECOY-URL-NUNCA-DEVE-APARECER-NO-HTML";
  assert.notEqual(decoyUrl, realOfferUrl, "sanity: a URL decoy precisa ser diferente da URL real da oferta");
  conn.prepare("UPDATE products SET affiliate_url=? WHERE id=?").run(decoyUrl, productId);
  try {
    const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
    const html = await res.text();
    assert.doesNotMatch(html, /DECOY-URL-NUNCA-DEVE-APARECER/);
    assert.ok(html.includes(realOfferUrl), "a URL real da oferta deve aparecer no HTML");
  } finally {
    conn.prepare("UPDATE products SET affiliate_url=? WHERE id=?").run(originalUrl, productId);
    conn.close();
  }
});

// ---------- not_found / archived over HTTP ----------

test("ranking em rascunho -> a página pública responde 404 real", async () => {
  const conn = rawDb();
  conn.prepare("UPDATE rankings SET status='draft' WHERE id=?").run(rankingId);
  try {
    const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
    assert.equal(res.status, 404);
    const html = await res.text();
    assert.match(html, /Página não encontrada/);
  } finally {
    conn.prepare("UPDATE rankings SET status='published' WHERE id=?").run(rankingId);
    conn.close();
  }
});

test("ranking arquivado (já publicado) -> tombstone 200, noindex, sem produtos/ItemList/links afiliados", async () => {
  const conn = rawDb();
  conn.prepare("UPDATE rankings SET status='archived' WHERE id=?").run(rankingId);
  try {
    const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Ranking arquivado/);
    assert.match(html, /name="robots" content="noindex/);
    assert.doesNotMatch(html, /application\/ld\+json/);
    assert.doesNotMatch(html, /class="cta ml"/);
    assert.doesNotMatch(html, /offer-price-current/);
  } finally {
    conn.prepare("UPDATE rankings SET status='published' WHERE id=?").run(rankingId);
    conn.close();
  }
});

test("ranking arquivado que nunca foi publicado (published_at nulo) continua 404, não vira tombstone", async () => {
  const conn = rawDb();
  const before = conn.prepare("SELECT status, published_at FROM rankings WHERE id=?").get(rankingId);
  conn.prepare("UPDATE rankings SET status='archived', published_at=NULL WHERE id=?").run(rankingId);
  try {
    const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
    assert.equal(res.status, 404);
  } finally {
    conn.prepare("UPDATE rankings SET status=?, published_at=? WHERE id=?").run(before.status, before.published_at, rankingId);
    conn.close();
  }
});

// ---------- Sitemap ----------

test("sitemap inclui /melhores-fones-mercado-livre quando o ranking está publicado", async () => {
  const res = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(res.status, 200);
  const xml = await res.text();
  assert.match(xml, /melhores-fones-mercado-livre/);
});

test("sitemap NÃO inclui /melhores-fones-mercado-livre quando o ranking está arquivado", async () => {
  const conn = rawDb();
  conn.prepare("UPDATE rankings SET status='archived' WHERE id=?").run(rankingId);
  try {
    const res = await fetch(`${baseUrl}/sitemap.xml`);
    const xml = await res.text();
    assert.doesNotMatch(xml, /melhores-fones-mercado-livre/);
  } finally {
    conn.prepare("UPDATE rankings SET status='published' WHERE id=?").run(rankingId);
    conn.close();
  }
});

test("controle final: com o ranking restaurado a publicado, a página volta a responder 200 normalmente", async () => {
  const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /class="cta ml"/);
});
