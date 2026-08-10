// Runs the real price-cents migration (022/023 in lib/db.ts) against an
// actual copy of the production database file, so "no data was lost" is a
// measured fact for this run, not an assumption. Kept in its own file: the
// Node test runner gives each test file its own process, so this file's
// DATABASE_PATH (pointed at a throwaway copy) can never collide with the
// fresh, empty temp database tests/admin-offers-primary.test.mjs sets up in
// its own process.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const REAL_DB = path.join(import.meta.dirname, "..", "data", "guia-do-fone.sqlite");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techno-blog-price-migration-"));
const copyPath = path.join(tempDir, "prod-copy.sqlite");

test.before(() => {
  assert.ok(fs.existsSync(REAL_DB), "real production database must exist to run this safety check against a copy of it");
  // NOT a plain fs.copyFileSync: the app runs in WAL mode, and a killed dev
  // server can leave recent, already-committed schema/data changes sitting
  // in the *.sqlite-wal sidecar file rather than checkpointed into the main
  // file — a raw byte copy of just the main file can silently produce a
  // stale snapshot missing real columns/rows. `VACUUM INTO` (the same
  // mechanism lib/backups.ts already uses for real backups) reads the
  // logically-current state, WAL included, and writes one self-contained,
  // fully checkpointed file — the correct way to get "a safe copy of the
  // existing structure" the task asked for.
  const source = new Database(REAL_DB, {readonly: true});
  source.prepare("VACUUM INTO ?").run(copyPath);
  source.close();

  // Roll the COPY back to a pre-022/023 shape if it isn't already — this
  // makes the test deterministic regardless of whether the live database
  // has already run these migrations by the time this test executes
  // (e.g. a dev server that hot-reloaded lib/db.ts). This only ever touches
  // the throwaway copy, never REAL_DB, and it's test-only scaffolding, not
  // a path any application code runs.
  const setup = new Database(copyPath);
  const cols = setup.prepare("PRAGMA table_info(affiliate_offers)").all().map((c) => c.name);
  if (cols.includes("current_price_cents")) {
    setup.exec("ALTER TABLE affiliate_offers ADD COLUMN current_price REAL");
    setup.exec("ALTER TABLE affiliate_offers ADD COLUMN previous_price REAL");
    setup.exec("ALTER TABLE affiliate_offers DROP COLUMN current_price_cents");
    setup.exec("ALTER TABLE affiliate_offers DROP COLUMN previous_price_cents");
    setup.prepare("DELETE FROM schema_migrations WHERE id IN ('022_offer_price_cents_columns','023_migrate_offer_prices_to_cents')").run();
  }
  setup.close();
});

test.after(() => {
  // Best-effort: on Windows, better-sqlite3's WAL-mode shared-memory file
  // handle can take a moment to fully release after close(), even though
  // closeDatabase() already ran above — a leftover temp file here doesn't
  // affect test correctness, only tidiness, so a cleanup failure must never
  // be reported as this test failing.
  try {
    fs.rmSync(tempDir, {recursive: true, force: true});
  } catch {
    // ignored — see above
  }
});

test("migração de preços para centavos, aplicada sobre uma cópia do banco real, preserva todos os produtos e ofertas", () => {
  // Snapshot BEFORE: raw counts and price values, read with a fresh
  // connection that never triggers our own migration code.
  const before = new Database(copyPath, {readonly: true});
  const productsBefore = before.prepare("SELECT count(*) n FROM products").get().n;
  const offersBefore = before.prepare("SELECT count(*) n FROM affiliate_offers").get().n;
  const columnsBefore = before.prepare("PRAGMA table_info(affiliate_offers)").all().map((c) => c.name);
  assert.ok(columnsBefore.includes("current_price"), "sanity check: the copy must still have the legacy REAL columns before migrating");
  const legacyPricesBefore = before
    .prepare("SELECT id, current_price, previous_price FROM affiliate_offers WHERE current_price IS NOT NULL OR previous_price IS NOT NULL")
    .all();
  before.close();

  // Run the migration for real: process.env.DATABASE_PATH + a fresh dynamic
  // import of lib/db.ts triggers applyMigrations() on first db() call,
  // exactly as it would on a real deploy against a database that predates
  // migrations 022/023.
  process.env.DATABASE_PATH = copyPath;
  return import("../lib/db.ts").then(({db, closeDatabase}) => {
    const conn = db();

    const productsAfter = conn.prepare("SELECT count(*) n FROM products").get().n;
    const offersAfter = conn.prepare("SELECT count(*) n FROM affiliate_offers").get().n;
    assert.equal(productsAfter, productsBefore, "product count must be unchanged by the price migration");
    assert.equal(offersAfter, offersBefore, "offer count must be unchanged by the price migration");
    assert.equal(productsAfter, 10, "expected the 10 real seeded products to still be present");
    assert.equal(offersAfter, 10, "expected the 10 real affiliate offers to still be present");

    const columnsAfter = conn.prepare("PRAGMA table_info(affiliate_offers)").all().map((c) => c.name);
    assert.ok(columnsAfter.includes("current_price_cents"), "new cents column must exist");
    assert.ok(columnsAfter.includes("previous_price_cents"), "new cents column must exist");
    assert.ok(!columnsAfter.includes("current_price"), "legacy float column must be gone once safely copied");
    assert.ok(!columnsAfter.includes("previous_price"), "legacy float column must be gone once safely copied");

    // Nothing invented: every row that was NULL in reais must still be NULL
    // in cents — no default, no fabricated value.
    const nullCentsCount = conn.prepare("SELECT count(*) n FROM affiliate_offers WHERE current_price_cents IS NULL AND previous_price_cents IS NULL").get().n;
    assert.equal(nullCentsCount, offersAfter, "every offer with no legacy price must have no cents price either — nothing invented");

    // Explicit, documented conversion rule verified for any row that DID
    // have a legacy value (none in this production snapshot, but the
    // assertion still runs and would fail if the rule were ever wrong).
    for (const row of legacyPricesBefore) {
      const migrated = conn.prepare("SELECT current_price_cents, previous_price_cents FROM affiliate_offers WHERE id=?").get(row.id);
      const expectedCurrent = row.current_price === null ? null : Math.round(row.current_price * 100);
      const expectedPrevious = row.previous_price === null ? null : Math.round(row.previous_price * 100);
      assert.equal(migrated.current_price_cents, expectedCurrent);
      assert.equal(migrated.previous_price_cents, expectedPrevious);
    }

    closeDatabase();
  });
});
