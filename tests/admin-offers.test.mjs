import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brlToCents, centsToBrl, isMeliLaAffiliateUrl, isMercadoLivreUrl, isValidPriceCents, publicPrice, resolvePrimaryFlag, SUPPORTED_RETAILER} from '../lib/offers-rules.ts';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// ---------- Behavioral: URL rules (real logic) ----------
// isMeliLaAffiliateUrl/isMercadoLivreUrl only confirm URL *structure*
// (https + exact hostname) — they never confirm the link resolves, that the
// listing is active, that it belongs to this project's affiliate account,
// or that a click generates commission. That's a manual check (see the
// "Abrir link" button in the admin form and the lastCheckedAt field).

test('URL: affiliate link must be an https://meli.la/... short link', () => {
  assert.equal(isMeliLaAffiliateUrl('https://meli.la/31hbsds'), true);
  assert.equal(isMeliLaAffiliateUrl('http://meli.la/31hbsds'), false); // not https
  assert.equal(isMeliLaAffiliateUrl('https://www.mercadolivre.com.br/produto'), false); // real product page, not an affiliate link
  assert.equal(isMeliLaAffiliateUrl('https://lista.mercadolivre.com.br/x'), false);
  assert.equal(isMeliLaAffiliateUrl('not a url'), false);
  assert.equal(isMeliLaAffiliateUrl('javascript:alert(1)'), false);
});

test('URL: subdomínio ou domínio parecido com meli.la é rejeitado (spoofing por sufixo)', () => {
  assert.equal(isMeliLaAffiliateUrl('https://meli.la.example.com/x'), false);
  assert.equal(isMeliLaAffiliateUrl('https://notmeli.la/x'), false);
  assert.equal(isMeliLaAffiliateUrl('https://sub.meli.la/x'), false); // only the exact host, no subdomain accepted
});

test('URL: tentativa de usar meli.la como userinfo (antes do @) é rejeitada mesmo se o host real também for meli.la', () => {
  assert.equal(isMeliLaAffiliateUrl('https://meli.la@evil.example/x'), false); // real host is evil.example
  assert.equal(isMeliLaAffiliateUrl('https://user:pass@meli.la/x'), false); // legit host, but userinfo present — rejected on principle
});

test('URL: protocolo HTTP e URL malformada são rejeitados', () => {
  assert.equal(isMeliLaAffiliateUrl('http://meli.la/x'), false);
  assert.equal(isMeliLaAffiliateUrl('ftp://meli.la/x'), false);
  assert.equal(isMeliLaAffiliateUrl(''), false);
  assert.equal(isMeliLaAffiliateUrl('   '), false);
  assert.equal(isMeliLaAffiliateUrl('meli.la/x'), false); // no scheme at all
});

test('URL: original product URL must be a real mercadolivre.com.br link', () => {
  assert.equal(isMercadoLivreUrl('https://www.mercadolivre.com.br/produto/p-123'), true);
  assert.equal(isMercadoLivreUrl('https://mercadolivre.com.br/produto'), true);
  assert.equal(isMercadoLivreUrl('https://lista.mercadolivre.com.br/busca'), true);
  assert.equal(isMercadoLivreUrl('https://meli.la/abc'), false); // affiliate link, not the original page
  assert.equal(isMercadoLivreUrl('https://evil.example.com/mercadolivre.com.br'), false); // lookalike host, not a subdomain
  assert.equal(isMercadoLivreUrl('http://mercadolivre.com.br/produto'), false); // not https
  assert.equal(isMercadoLivreUrl('https://mercadolivre.com.br@evil.example/x'), false); // userinfo trick
});

// ---------- Behavioral: money (cents, never float) ----------

test('preço: isValidPriceCents exige inteiro não negativo', () => {
  assert.equal(isValidPriceCents(19990), true);
  assert.equal(isValidPriceCents(0), true);
  assert.equal(isValidPriceCents(-1), false);
  assert.equal(isValidPriceCents(199.9), false); // not an integer — cents must always be whole
  assert.equal(isValidPriceCents(NaN), false);
  assert.equal(isValidPriceCents(Infinity), false);
  assert.equal(isValidPriceCents('199'), false);
  assert.equal(isValidPriceCents(null), false);
});

test('brlToCents: converte texto em formato brasileiro para centavos sem passar por ponto flutuante', () => {
  assert.equal(brlToCents('219,90'), 21990);
  assert.equal(brlToCents('1.234,56'), 123456);
  assert.equal(brlToCents('0,01'), 1);
  assert.equal(brlToCents('1234'), 123400); // whole reais, no cents typed
  assert.equal(brlToCents('R$ 219,90'), 21990);
  assert.equal(brlToCents('  219,90  '), 21990);
});

test('brlToCents: entrada vazia é null (não zero), entrada inválida é null (nunca inventa valor)', () => {
  assert.equal(brlToCents(''), null);
  assert.equal(brlToCents('   '), null);
  assert.equal(brlToCents('abc'), null);
  assert.equal(brlToCents('219.90'), null); // ponto como decimal não é o formato brasileiro aceito para centavos
  assert.equal(brlToCents('219,9'), null); // só um dígito de centavo
  assert.equal(brlToCents('-219,90'), null); // preço nunca é negativo
});

test('centsToBrl: formata centavos de volta para o texto brasileiro (round-trip com brlToCents)', () => {
  assert.equal(centsToBrl(21990), '219,90');
  assert.equal(centsToBrl(123456), '1.234,56');
  assert.equal(centsToBrl(1), '0,01');
  assert.equal(centsToBrl(null), '');
  for (const text of ['219,90', '1.234,56', '0,01']) {
    assert.equal(centsToBrl(brlToCents(text)), text);
  }
});

// ---------- Behavioral: primary-offer invariant (pure rule) ----------
// The real transactional/rollback/concurrency behavior of this invariant is
// covered end-to-end against a real temporary database in
// tests/admin-offers-primary.test.mjs — this file only covers the pure
// decision function in isolation.

test('oferta principal: só pode ficar principal se o status for "active"', () => {
  assert.equal(resolvePrimaryFlag(true, 'active'), true);
  assert.equal(resolvePrimaryFlag(true, 'inactive'), false);
  assert.equal(resolvePrimaryFlag(true, 'broken'), false);
  assert.equal(resolvePrimaryFlag(false, 'active'), false);
});

// ---------- Behavioral: public price exposure rule ----------

test('preço público: só é exposto quando há data de última verificação', () => {
  assert.equal(publicPrice(21990, '2026-08-10T00:00:00.000Z'), 21990);
  assert.equal(publicPrice(21990, null), null);
  assert.equal(publicPrice(null, '2026-08-10T00:00:00.000Z'), null);
});

test('apenas Mercado Livre é suportado nesta fase', () => {
  assert.equal(SUPPORTED_RETAILER, 'Mercado Livre');
});

// ---------- Structural: migration, routes, public-query shape ----------
// Real behavior (transactions, rollback, concurrency, actual migration
// results) is covered by the .test.mjs files that import and run the real
// code against a real database — see admin-offers-primary.test.mjs and
// admin-offers-price-migration.test.mjs. What's left here is intentionally
// limited to things that are legitimately about *source shape*: which guard
// a route imports, which fields a type/query includes — not the demote/
// rollback/rollback ordering itself.

test('migração: affiliate_offers ganha as colunas de centavos e as duas restrições de unicidade, sem apagar tabela ou dados', () => {
  const db = read('lib/db.ts');
  assert.match(db, /ALTER TABLE affiliate_offers ADD COLUMN current_price_cents INTEGER/);
  assert.match(db, /ALTER TABLE affiliate_offers ADD COLUMN previous_price_cents INTEGER/);
  assert.match(db, /ALTER TABLE affiliate_offers ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0/);
  assert.match(db, /ALTER TABLE affiliate_offers ADD COLUMN internal_note TEXT/);
  assert.match(db, /CREATE UNIQUE INDEX affiliate_offers_url_unique ON affiliate_offers\(product_id,affiliate_url\)/);
  assert.match(db, /CREATE UNIQUE INDEX affiliate_offers_primary_unique ON affiliate_offers\(product_id,retailer\) WHERE is_primary=1 AND status='active'/);
  assert.doesNotMatch(db, /DROP TABLE affiliate_offers/);
  assert.doesNotMatch(db, /DELETE FROM affiliate_offers/);
});

test('migração de preço: o valor legado só é copiado (nunca inventado) antes das colunas antigas serem removidas', () => {
  const db = read('lib/db.ts');
  const startAt = db.indexOf('id: "023_migrate_offer_prices_to_cents"');
  // Search for a newline-prefixed "];" (the migrations array's real closing
  // bracket) — a bare "];" also appears mid-line inside this migration's own
  // `as {...}[]` type annotation and would cut the slice short.
  const migrationFn = db.slice(startAt, db.indexOf('\n];', startAt));
  assert.match(migrationFn, /WHERE current_price IS NOT NULL OR previous_price IS NOT NULL/, 'só linhas com valor legado não-nulo são lidas');
  assert.match(migrationFn, /Math\.round\(r\.current_price \* 100\)/);
  assert.match(migrationFn, /Math\.round\(r\.previous_price \* 100\)/);
  const dropAt = migrationFn.indexOf('DROP COLUMN current_price');
  const updateAt = migrationFn.indexOf('UPDATE affiliate_offers SET current_price_cents');
  assert.ok(updateAt !== -1 && dropAt !== -1 && updateAt < dropAt, 'a cópia dos valores deve rodar antes da remoção das colunas antigas');
});

test('offers routes: all mutations require requireAdminMutation (auth + CSRF), reads require requireAdmin', () => {
  const collection = read('app/api/admin/offers/route.ts');
  const item = read('app/api/admin/offers/[id]/route.ts');
  assert.match(collection, /requireAdmin\(\)/);
  assert.match(collection, /requireAdminMutation\(req\)/);
  assert.match(item, /requireAdmin\(\)/);
  // PATCH and DELETE both mutate — every export in this file after GET must use the mutation guard
  const afterGet = item.slice(item.indexOf('export async function PATCH'));
  assert.doesNotMatch(afterGet, /await requireAdmin\(\);/);
  assert.match(afterGet, /requireAdminMutation\(req\)/g);
});

test('offers routes never hard-delete without going through requireAdminMutation, and deletion is allowed (no dependents in this phase)', () => {
  const item = read('app/api/admin/offers/[id]/route.ts');
  assert.match(item, /export async function DELETE/);
  assert.match(item, /deleteOffer\(id\)/);
});

test('validação da API: preço aceita apenas texto em formato brasileiro (brlToCents), nunca um número bruto', () => {
  const route = read('app/api/admin/offers/route.ts');
  assert.match(route, /brlToCents/);
  assert.match(route, /typeof v !== "string"/, 'um número bruto no corpo da requisição deve ser rejeitado, não convertido');
});

test('public offers query excludes internal fields by construction (narrow return type, no internal_note/status/retailer/id)', () => {
  const src = read('lib/public-offers.ts');
  const shapeFn = src.slice(src.indexOf('function shape'), src.indexOf('export function publicPrimaryOfferForProduct'));
  for (const forbidden of ['internal_note', 'status:', 'retailer', 'row.id', 'original_product_url']) {
    assert.doesNotMatch(shapeFn, new RegExp(forbidden), `public offer shape must never include ${forbidden}`);
  }
  assert.match(shapeFn, /publicPrice\(row\.current_price_cents/);
  assert.match(shapeFn, /publicPrice\(row\.previous_price_cents/);
});

test('public offers query only selects primary, active offers from active, non-deleted products', () => {
  const src = read('lib/public-offers.ts');
  assert.match(src, /o\.is_primary = 1/);
  assert.match(src, /o\.status = 'active'/);
  assert.match(src, /p\.is_active = 1/);
  assert.match(src, /p\.deleted_at IS NULL/);
});

test('duplicate URL and duplicate-primary conflicts are both translated to friendly messages, not a raw SQLite error', () => {
  const route = read('app/api/admin/offers/route.ts');
  assert.match(route, /export function offerConflictMessage/);
  assert.match(route, /Já existe uma oferta com esta URL afiliada/);
  assert.match(route, /Já existe outra oferta principal ativa/);
  const item = read('app/api/admin/offers/[id]/route.ts');
  assert.match(item, /offerConflictMessage/);
});
