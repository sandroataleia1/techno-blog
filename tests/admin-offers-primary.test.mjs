// Real behavioral tests for the "only one active primary offer per
// product+retailer" invariant — run against an actual temporary SQLite
// database (full migration chain + seed), not regex over source text.
//
// Two things make this possible where it wasn't before:
//   1. "server-only" is now a real installed package (see package.json) and
//      the test script runs with --conditions=react-server, the same export
//      condition Next's own server bundle uses to resolve it to a no-op.
//   2. tests/support/alias-hooks.mjs teaches plain `node --test` the "@/"
//      path alias that lib/offers.ts and lib/db.ts use internally, via
//      Node's standard module-customization hooks (loaded with
//      --experimental-loader — see that file for why not module.register())
//      — no change to any source file was needed for either fix.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techno-blog-offers-primary-"));
process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");

// Dynamic imports (not static): DATABASE_PATH must be set before lib/db.ts
// first evaluates (it reads it into a module-level constant), and static
// imports are hoisted ahead of the assignment above.
const {createOffer, offerById, updateOffer, setOfferStatus} = await import("../lib/offers.ts");
const {db, closeDatabase} = await import("../lib/db.ts");

// db() runs the full migration chain + seed() on first call — 10 real demo
// products come out of that for free, so fixtures here are as realistic as
// production data rather than hand-rolled stand-ins.
const productIds = db()
  .prepare("SELECT id FROM products ORDER BY position")
  .all()
  .map((r) => r.id);
assert.ok(productIds.length >= 5, "expected the seeded demo catalog to provide at least 5 products for fixtures");

test.after(() => {
  closeDatabase();
  fs.rmSync(tempDir, {recursive: true, force: true});
});

function countActivePrimary(productId, retailer = "Mercado Livre") {
  return db()
    .prepare("SELECT count(*) n FROM affiliate_offers WHERE product_id=? AND retailer=? AND is_primary=1 AND status='active'")
    .get(productId, retailer).n;
}

function offerInput(overrides) {
  return {
    retailer: "Mercado Livre",
    originalProductUrl: null,
    lastCheckedAt: null,
    currentPriceCents: null,
    previousPriceCents: null,
    internalNote: null,
    isPrimary: false,
    status: "active",
    ...overrides,
  };
}

test("criar segunda oferta principal ativa rebaixa a anterior, e resta exatamente uma principal", () => {
  const productId = productIds[0];
  const first = createOffer(offerInput({productId, affiliateUrl: "https://meli.la/primary-swap-a", isPrimary: true}));
  assert.equal(first.is_primary, 1);

  const second = createOffer(offerInput({productId, affiliateUrl: "https://meli.la/primary-swap-b", isPrimary: true}));

  assert.equal(offerById(first.id).is_primary, 0, "a oferta anterior deve ser rebaixada");
  assert.equal(offerById(second.id).is_primary, 1, "a nova oferta deve ser principal");
  assert.equal(countActivePrimary(productId), 1, "deve restar exatamente uma principal ativa");
});

test("editar uma oferta existente para principal rebaixa a irmã anterior", () => {
  const productId = productIds[1];
  const a = createOffer(offerInput({productId, affiliateUrl: "https://meli.la/edit-primary-a", isPrimary: true}));
  const b = createOffer(offerInput({productId, affiliateUrl: "https://meli.la/edit-primary-b", isPrimary: false}));
  assert.equal(offerById(a.id).is_primary, 1);
  assert.equal(offerById(b.id).is_primary, 0);

  updateOffer(b.id, offerInput({productId, affiliateUrl: b.affiliate_url, isPrimary: true}));

  assert.equal(offerById(a.id).is_primary, 0, "a irmã anterior deve ser rebaixada");
  assert.equal(offerById(b.id).is_primary, 1);
  assert.equal(countActivePrimary(productId), 1);
});

test("falha no INSERT após o rebaixamento sofre rollback: a oferta principal anterior continua principal", () => {
  const productId = productIds[2];
  const primary = createOffer(offerInput({productId, affiliateUrl: "https://meli.la/rollback-primary", isPrimary: true}));
  // An inactive sibling doesn't conflict with the primary-uniqueness index,
  // but its URL still occupies the (product_id, affiliate_url) unique index —
  // reusing that URL below forces the INSERT to fail *after* demoteSiblings
  // has already run inside the same transaction.
  const other = createOffer(offerInput({productId, affiliateUrl: "https://meli.la/rollback-url-taken", status: "inactive", isPrimary: false}));

  assert.throws(
    () => createOffer(offerInput({productId, affiliateUrl: other.affiliate_url, isPrimary: true})),
    /UNIQUE constraint failed/
  );

  assert.equal(offerById(primary.id).is_primary, 1, "a oferta principal anterior deve continuar principal após o rollback");
  assert.equal(countActivePrimary(productId), 1, "a tentativa falha não pode deixar o produto sem nenhuma principal, nem com duas");
});

test('oferta inativa ou quebrada nunca é salva como principal, mesmo quando solicitado', () => {
  const productId = productIds[3];

  const inactiveAttempt = createOffer(offerInput({productId, affiliateUrl: "https://meli.la/inactive-cant-be-primary", status: "inactive", isPrimary: true}));
  assert.equal(inactiveAttempt.is_primary, 0);

  const brokenAttempt = createOffer(offerInput({productId, affiliateUrl: "https://meli.la/broken-cant-be-primary", status: "broken", isPrimary: true}));
  assert.equal(brokenAttempt.is_primary, 0);

  const active = createOffer(offerInput({productId, affiliateUrl: "https://meli.la/active-then-broken", status: "active", isPrimary: true}));
  assert.equal(active.is_primary, 1);
  const demoted = setOfferStatus(active.id, "broken");
  assert.equal(demoted.is_primary, 0, "setOfferStatus deve limpar is_primary ao tirar uma oferta principal do status ativo");
});

test("conflito de unicidade em uma escrita concorrente resulta em estado consistente (índice único parcial como proteção final)", () => {
  const productId = productIds[4];
  const primary = createOffer(offerInput({productId, affiliateUrl: "https://meli.la/concurrent-primary", isPrimary: true}));

  // A second, independent connection to the same database file — simulates
  // a writer that bypasses lib/offers.ts (and therefore demoteSiblings)
  // entirely. This is exactly the scenario the partial unique index
  // (migration 020) exists to guard against as a backstop that doesn't
  // depend on any application-level code being correct.
  const raw = new Database(process.env.DATABASE_PATH);
  try {
    assert.throws(() => {
      raw
        .prepare(
          "INSERT INTO affiliate_offers (id,product_id,retailer,affiliate_url,original_product_url,status,last_checked_at,current_price_cents,previous_price_cents,is_primary,internal_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
        )
        .run(crypto.randomUUID(), productId, "Mercado Livre", "https://meli.la/concurrent-intruder", null, "active", null, null, null, 1, null);
    }, /UNIQUE constraint failed/);
  } finally {
    raw.close();
  }

  assert.equal(offerById(primary.id).is_primary, 1, "a principal original não pode ser afetada pela escrita concorrente rejeitada");
  assert.equal(countActivePrimary(productId), 1);
});
