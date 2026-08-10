import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('every new Fase C1 admin API route requires an authenticated session', () => {
  const routes = [
    'app/api/admin/brands/route.ts',
    'app/api/admin/brands/[id]/route.ts',
    'app/api/admin/categories/route.ts',
    'app/api/admin/categories/[id]/route.ts',
    'app/api/admin/specification-definitions/route.ts',
    'app/api/admin/specification-definitions/[id]/route.ts',
    'app/api/admin/sources/route.ts',
    'app/api/admin/sources/[id]/route.ts',
    'app/api/admin/products/[id]/specifications/route.ts',
  ];
  for (const route of routes) assert.match(read(route), /requireAdmin\(\)/, `${route} must call requireAdmin()`);
});

test('the authenticated admin route group guards every nested page with a redirect', () => {
  const layout = read('app/admin/(authenticated)/layout.tsx');
  assert.match(layout, /adminSession/);
  assert.match(layout, /redirect\("\/admin\/login"\)/);
});

test('brands and categories cannot be silently hard-deleted (status toggle only)', () => {
  assert.doesNotMatch(read('app/api/admin/brands/[id]/route.ts'), /export async function DELETE/);
  assert.doesNotMatch(read('app/api/admin/categories/[id]/route.ts'), /export async function DELETE/);
});

test('specification definitions refuse deletion while product values still reference them', () => {
  const lib = read('lib/specifications.ts');
  assert.match(lib, /product_specifications WHERE specification_definition_id=\?/);
  assert.match(lib, /ok: false/);
});

test('official/manufacturer URLs are validated as plain https, not the Mercado Livre affiliate allowlist', () => {
  const admin = read('lib/admin.ts');
  assert.match(admin, /export function validHttpsUrl/);
  assert.match(read('app/api/admin/brands/route.ts'), /validHttpsUrl/);
  assert.match(read('app/api/admin/products/route.ts'), /validHttpsUrl/);
});

test('product creation/update keeps legacy brand/category text columns in sync for the still-unmigrated public site', () => {
  const create = read('app/api/admin/products/route.ts');
  const update = read('app/api/admin/products/[id]/route.ts');
  assert.match(create, /brand: p\.brandName/);
  assert.match(create, /category: p\.categoryName/);
  assert.match(update, /brand: brand\.name/);
  assert.match(update, /category: category\.name/);
});

test('new schema migrations remain additive: no DROP TABLE and no deleting product rows', () => {
  const db = read('lib/db.ts');
  assert.doesNotMatch(db, /DROP TABLE/i);
  assert.doesNotMatch(db, /DELETE FROM products/i);
});

// DROP COLUMN is otherwise banned by the test above's spirit (this schema's
// migration philosophy is additive-only, per the Techno Blog rebrand plan),
// with exactly one documented, proven-safe exception: replacing the
// float-typed legacy price columns with integer-cents ones (see
// tests/admin-offers-price-migration.test.mjs for the real-data safety
// proof). Anything beyond these two specific, already-audited statements
// must fail this test and get the same scrutiny this one got.
test('the only DROP COLUMN statements in the schema are the two audited legacy float-price columns', () => {
  const db = read('lib/db.ts');
  const dropMatches = [...db.matchAll(/DROP COLUMN \w+/gi)].map((m) => m[0]);
  assert.deepEqual(
    dropMatches.sort(),
    ['DROP COLUMN current_price', 'DROP COLUMN previous_price'].sort(),
    'any new DROP COLUMN must be a deliberate, reviewed, data-safety-proven exception — not an accidental destructive migration'
  );
});
