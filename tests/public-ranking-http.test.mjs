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

test("card com preço mostra valor formatado e a data de verificação", async () => {
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

// Three distinct products, three distinct and individually identifiable
// (previous, current) pairs — greater/equal/less than — so each assertion
// can only pass by actually reading the right value, never by coincidence
// with another scenario's numbers.
test("preço anterior aparece riscado quando maior que o atual", async () => {
  const conn = rawDb();
  const productId = productIds[3];
  const now = new Date().toISOString();
  // previous (R$ 411,17) > current (R$ 370,42)
  conn.prepare("UPDATE affiliate_offers SET current_price_cents=37042, previous_price_cents=41117, last_checked_at=? WHERE product_id=? AND is_primary=1").run(now, productId);
  try {
    const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
    const html = await res.text();
    assert.match(html, /R\$\s?370,42/, "preço atual deve aparecer");
    assert.match(html, /R\$\s?411,17/, "preço anterior maior deve aparecer riscado");
    assert.match(html, /offer-price-previous[^>]*>\s*R\$\s?411,17/);
  } finally {
    conn.prepare("UPDATE affiliate_offers SET current_price_cents=NULL, previous_price_cents=NULL, last_checked_at=NULL WHERE product_id=?").run(productId);
    conn.close();
  }
});

test("preço anterior NÃO aparece quando igual ao atual", async () => {
  const conn = rawDb();
  const productId = productIds[4];
  const now = new Date().toISOString();
  // previous === current (R$ 528,63) — showing it struck through would be
  // misleading (implies a discount that doesn't exist).
  conn.prepare("UPDATE affiliate_offers SET current_price_cents=52863, previous_price_cents=52863, last_checked_at=? WHERE product_id=? AND is_primary=1").run(now, productId);
  try {
    const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
    const html = await res.text();
    assert.match(html, /R\$\s?528,63/, "preço atual deve aparecer");
    assert.doesNotMatch(html, /offer-price-previous/);
  } finally {
    conn.prepare("UPDATE affiliate_offers SET current_price_cents=NULL, previous_price_cents=NULL, last_checked_at=NULL WHERE product_id=?").run(productId);
    conn.close();
  }
});

test("preço anterior NÃO aparece quando menor que o atual", async () => {
  const conn = rawDb();
  const productId = productIds[5];
  const now = new Date().toISOString();
  // previous (R$ 199,05) < current (R$ 640,80) — a lower "previous" price
  // isn't a discount signal, so it must never render as one.
  conn.prepare("UPDATE affiliate_offers SET current_price_cents=64080, previous_price_cents=19905, last_checked_at=? WHERE product_id=? AND is_primary=1").run(now, productId);
  try {
    const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
    const html = await res.text();
    assert.match(html, /R\$\s?640,80/, "preço atual deve aparecer");
    assert.doesNotMatch(html, /offer-price-previous/);
    assert.doesNotMatch(html, /R\$\s?199,05/, "o valor anterior menor não deve aparecer em lugar nenhum do card");
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

// ---------- Published but structurally invalid: fails closed with a real 500 ----------

// Verified empirically (real `next dev` and a real `next start` build, plus
// a real headless-Chrome navigation) before writing this assertion: in this
// Next.js 16.3 version, a Server Component throw during the *initial,
// non-streamed* render of a route is rendered, pre-hydration, using the
// app's own generic not-found-styled shell (same markup as app/not-found.tsx)
// rather than this segment's own error.tsx — the error.tsx module is still
// referenced in the RSC payload and genuinely takes over once client-side
// hydration runs (confirmed with a real browser: after hydration, the page
// shows the exact text "Não foi possível carregar este ranking agora" from
// error.tsx), but a plain fetch() — no JS execution — only ever observes the
// pre-hydration shell. This is a real, reproducible framework behavior in
// this exact Next version (see node_modules/next/dist/docs/.../error.md
// version history — the `retry` prop only just became stable in 16.3.0),
// not a bug in this app's error.tsx. The assertions below verify what a
// plain HTTP client can actually, truthfully observe: a real 500, a safe
// generic message with zero ranking-specific content, and no internal
// detail — not the specific error.tsx copy, which no plain-fetch test can
// see. (dev server log for this exact request, captured separately during
// investigation, confirmed Next did log the real thrown Error server-side
// with a numeric — not NEXT_NOT_FOUND — digest, i.e. genuinely treated as
// an unexpected error, not a notFound() call.)
test("ranking published inválido (falta o item da posição 10) -> 500 real, mensagem genérica, sem vazamento de nada", async () => {
  const conn = rawDb();
  const allItems = conn
    .prepare("SELECT ri.*, p.name AS product_name, p.slug AS product_slug FROM ranking_items ri JOIN products p ON p.id=ri.product_id WHERE ri.ranking_id=? ORDER BY ri.position")
    .all(rankingId);
  const removed = allItems.find((i) => i.position === 10);
  assert.ok(removed, "setup: esperava um item na posição 10 para remover");
  conn.prepare("DELETE FROM ranking_items WHERE id=?").run(removed.id);
  try {
    const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
    assert.equal(res.status, 500, "um ranking published mas estruturalmente inválido deve responder com um erro operacional real, não 200 nem um Top 10 parcial");
    const html = await res.text();

    // A safe, generic, non-empty public message — not a blank page and not
    // a raw stack trace. See the comment above this test for exactly which
    // shell this is and why.
    assert.match(html, /Indisponível|Página não encontrada|Não foi possível/);

    // Nothing product-related from this ranking may leak — not even the 9
    // still-structurally-fine items, since the whole ranking fails closed.
    for (const item of allItems) {
      assert.doesNotMatch(html, new RegExp(item.product_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(html, new RegExp(`/fones/${item.product_slug}`));
    }
    assert.doesNotMatch(html, /Top 3/i);
    assert.doesNotMatch(html, /application\/ld\+json/);
    assert.doesNotMatch(html, /class="cta ml"/);
    assert.doesNotMatch(html, /rank-tag|rank-benefit|rank-caution/);

    // No internal detail of any kind. (Not checking for "node_modules" —
    // Next's own public bundle chunk filenames legitimately contain that
    // substring, e.g. "node_modules_next_dist_compiled_react-dom_...js";
    // that's a normal <script src> on every page, not a leak. Also not
    // asserting the *absence* of page.tsx's own thrown Error.message
    // string: confirmed via node_modules/next/dist/docs/.../error.md —
    // "During development, the Error object forwarded to the client will
    // be serialized and include the message of the original error for
    // easier debugging. However, this behavior is different in
    // production" — so `next dev` intentionally embeds it in hydration
    // data for debugging, while a real production build only ships a
    // generic message + digest. The thrown message itself
    // ("Não foi possível carregar este ranking no momento.") is already
    // safe, curated, user-appropriate copy with zero SQL/stack/table
    // detail either way — it just isn't the *specific* text error.tsx
    // shows once hydrated.)
    assert.doesNotMatch(html, /SQLite|SqliteError|SQLITE_|SQL syntax|F:\\projetos|\/f\/projetos|projetos\\afiliados|ranking_items|TypeError:|ReferenceError:/i);
  } finally {
    conn
      .prepare(
        "INSERT INTO ranking_items (id,ranking_id,product_id,position,badge,reason,main_benefit,main_limitation) VALUES (?,?,?,?,?,?,?,?)"
      )
      .run(removed.id, removed.ranking_id, removed.product_id, removed.position, removed.badge, removed.reason, removed.main_benefit, removed.main_limitation);
    conn.close();
  }
});

test("controle: com o item da posição 10 restaurado, o ranking volta a responder 200 normalmente", async () => {
  const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.equal((html.match(/application\/ld\+json/g) || []).length > 0, true);
});

// ---------- not_found / archived over HTTP ----------

test("ranking inexistente para o slug fixo -> 404 real, sem conteúdo parcial, restaurado no finally", async () => {
  const conn = rawDb();
  const decoySlug = `slug-temporariamente-indisponivel-${Date.now()}`;
  const ranking = conn.prepare("SELECT title FROM rankings WHERE id=?").get(rankingId);
  // Renaming the seed's own row away from the one fixed public slug
  // ("melhores-fones-mercado-livre" — see RANKING_SLUG in
  // app/melhores-fones-mercado-livre/page.tsx) means a lookup by that slug
  // now finds *no row at all*, the genuine "ranking inexistente" case —
  // distinct from the draft/archived tests above, which still have a row.
  conn.prepare("UPDATE rankings SET slug=? WHERE id=?").run(decoySlug, rankingId);
  try {
    const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
    assert.equal(res.status, 404);
    const html = await res.text();
    assert.match(html, /Página não encontrada/);
    assert.doesNotMatch(html, new RegExp(ranking.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "nenhum conteúdo parcial do ranking real deve vazar em um 404");
    assert.doesNotMatch(html, /application\/ld\+json/);
    assert.doesNotMatch(html, /class="cta ml"/);
  } finally {
    conn.prepare("UPDATE rankings SET slug=? WHERE id=?").run("melhores-fones-mercado-livre", rankingId);
    conn.close();
  }
});

test("controle: com o slug restaurado, o ranking volta a responder 200 normalmente", async () => {
  const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
  assert.equal(res.status, 200);
});

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
  const items = conn
    .prepare("SELECT p.name AS product_name, p.slug AS product_slug FROM ranking_items ri JOIN products p ON p.id=ri.product_id WHERE ri.ranking_id=?")
    .all(rankingId);
  assert.equal(items.length, 10, "setup: sanity check — o ranking do seed deve ter 10 itens antes de arquivar");
  conn.prepare("UPDATE rankings SET status='archived' WHERE id=?").run(rankingId);
  try {
    const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Ranking arquivado/);
    assert.match(html, /name="robots" content="noindex, ?follow/);
    assert.doesNotMatch(html, /application\/ld\+json/);
    assert.doesNotMatch(html, /class="cta ml"/);
    assert.doesNotMatch(html, /offer-price-current/);

    // Explicit, product-by-product proof — not just "no ItemList marker",
    // but that none of the 10 real product names or /fones/[slug] links
    // that this exact ranking would otherwise show are present anywhere.
    for (const item of items) {
      assert.doesNotMatch(html, new RegExp(item.product_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `nome do produto "${item.product_name}" não deve aparecer no tombstone`);
      assert.doesNotMatch(html, new RegExp(`/fones/${item.product_slug}`), `link para /fones/${item.product_slug} não deve aparecer no tombstone`);
    }
    assert.doesNotMatch(html, /Top 3/i);
    assert.doesNotMatch(html, /id="ranking"/);
    assert.doesNotMatch(html, /id="comparador"/);
    assert.doesNotMatch(html, /Comparador/);
    assert.doesNotMatch(html, /rank-tag|rank-benefit|rank-caution|rank-num/);
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
