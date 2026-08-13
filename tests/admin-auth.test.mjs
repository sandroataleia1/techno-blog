import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scryptSync, randomBytes} from 'node:crypto';
import {isValidHashFormat, resolvePasswordHash, sign, timingSafeEqualStrings, verifyPassword} from '../lib/auth-crypto.ts';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function makeHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

// ---------- Behavioral: password hashing (real logic, not source-regex) ----------

test('login válido: verifyPassword accepts the correct password against its own hash', () => {
  const hash = makeHash('correct horse battery staple');
  assert.equal(verifyPassword('correct horse battery staple', hash), true);
});

test('login inválido: verifyPassword rejects a wrong password', () => {
  const hash = makeHash('correct horse battery staple');
  assert.equal(verifyPassword('wrong password entirely', hash), false);
});

test('credencial malformada: verifyPassword never throws on a corrupted or empty hash', () => {
  assert.equal(verifyPassword('anything', ''), false);
  assert.equal(verifyPassword('anything', 'scrypt'), false); // the exact dotenv-expand corruption
  assert.equal(verifyPassword('anything', 'scrypt$onlysalt'), false);
  assert.equal(verifyPassword('anything', 'not-scrypt-at-all$a$b'), false);
});

test('isValidHashFormat accepts a real hash and rejects the dotenv-expand-corrupted form', () => {
  const hash = makeHash('whatever');
  assert.equal(isValidHashFormat(hash), true);
  assert.equal(isValidHashFormat('scrypt'), false); // what "$salt$hash" collapses to when $-expanded
  assert.equal(isValidHashFormat(''), false);
  assert.equal(isValidHashFormat('scrypt$$'), false);
});

// ---------- Behavioral: hash resolution (direct env var vs. base64 fallback) ----------

test('credencial ausente: resolvePasswordHash returns "" when neither variable is set', () => {
  assert.equal(resolvePasswordHash({}), '');
});

test('resolvePasswordHash prefers the direct ADMIN_PASSWORD_HASH when it is well-formed', () => {
  const hash = makeHash('pw1');
  const result = resolvePasswordHash({ADMIN_PASSWORD_HASH: hash, ADMIN_PASSWORD_HASH_BASE64: Buffer.from(makeHash('pw2')).toString('base64')});
  assert.equal(result, hash);
});

test('resolvePasswordHash falls back to ADMIN_PASSWORD_HASH_BASE64 when the direct value is missing', () => {
  const hash = makeHash('pw3');
  const result = resolvePasswordHash({ADMIN_PASSWORD_HASH_BASE64: Buffer.from(hash).toString('base64')});
  assert.equal(result, hash);
});

test('resolvePasswordHash falls back to base64 when the direct value is exactly the dotenv-expand corruption', () => {
  const hash = makeHash('pw4');
  const result = resolvePasswordHash({ADMIN_PASSWORD_HASH: 'scrypt', ADMIN_PASSWORD_HASH_BASE64: Buffer.from(hash).toString('base64')});
  assert.equal(result, hash);
});

test('resolvePasswordHash returns "" (never throws) for malformed base64', () => {
  assert.doesNotThrow(() => resolvePasswordHash({ADMIN_PASSWORD_HASH_BASE64: '***not base64***'}));
  assert.equal(resolvePasswordHash({ADMIN_PASSWORD_HASH_BASE64: '***not base64***'}), '');
});

// ---------- Behavioral: token signing ----------

test('sign is deterministic for the same value+secret and differs for a different secret', () => {
  const a = sign('payload', 'secret-a');
  const b = sign('payload', 'secret-a');
  const c = sign('payload', 'secret-b');
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('timingSafeEqualStrings compares correctly without throwing on length mismatch', () => {
  assert.equal(timingSafeEqualStrings('abc', 'abc'), true);
  assert.equal(timingSafeEqualStrings('abc', 'abd'), false);
  assert.doesNotThrow(() => timingSafeEqualStrings('short', 'a-much-longer-string'));
  assert.equal(timingSafeEqualStrings('short', 'a-much-longer-string'), false);
});

// ---------- Structural: cookie attributes, session guard, route wiring ----------

test('sessão: adminSession is not evaluated before configured() — consistent response when unconfigured', () => {
  const admin = read('lib/admin.ts');
  assert.match(admin, /if \(!configured\(\)\) return false;/);
});

test('atributos do cookie: httpOnly, SameSite=lax, Secure só em produção, path "/", expiração explícita', () => {
  const admin = read('lib/admin.ts');
  assert.match(admin, /httpOnly:\s*true/);
  assert.match(admin, /sameSite:\s*"lax"/);
  assert.match(admin, /secure:\s*process\.env\.NODE_ENV === "production"/);
  assert.match(admin, /path:\s*cookiePath/);
  assert.match(admin, /const cookiePath = "\/"/);
  assert.match(admin, /maxAge:\s*ttl/);
});

test('logout: clearSession explicitly matches the same cookie path used at login, so deletion actually takes effect', () => {
  const admin = read('lib/admin.ts');
  const clearFn = admin.slice(admin.indexOf('export async function clearSession'));
  assert.match(clearFn, /path:\s*cookiePath/);
  assert.match(clearFn, /maxAge:\s*0/);
});

test('CSRF: requireAdminMutation checks session AND origin allowlist before allowing a mutation', () => {
  const admin = read('lib/admin.ts');
  const fn = admin.slice(admin.indexOf('export async function requireAdminMutation'), admin.indexOf('export async function clearSession'));
  assert.match(fn, /await requireAdmin\(\)/);
  assert.match(fn, /originAllowed\(req\)/);
  assert.match(fn, /FORBIDDEN/);
});

test('ADMIN_ALLOWED_ORIGINS: originAllowed nunca deriva a origem confiável de Host/X-Forwarded-Host — só de env', () => {
  const admin = read('lib/admin.ts');
  const fn = admin.slice(admin.indexOf('export function originAllowed'), admin.indexOf('export async function requireAdminMutation'));
  assert.doesNotMatch(fn, /req\.url|x-forwarded-host|req\.headers\.get\(.host.\)/i);
  assert.match(fn, /ADMIN_ALLOWED_ORIGINS/);
});

test('mutação sem autenticação: every state-changing admin API route requires requireAdminMutation, not just a plain read guard', () => {
  const mutationRoutes = [
    ['app/api/admin/products/route.ts', ['POST']],
    ['app/api/admin/products/[id]/route.ts', ['PATCH', 'DELETE']],
    ['app/api/admin/products/[id]/image/route.ts', ['POST', 'DELETE']],
    ['app/api/admin/products/[id]/specifications/route.ts', ['PUT']],
    ['app/api/admin/brands/route.ts', ['POST']],
    ['app/api/admin/brands/[id]/route.ts', ['PATCH']],
    ['app/api/admin/categories/route.ts', ['POST']],
    ['app/api/admin/categories/[id]/route.ts', ['PATCH']],
    ['app/api/admin/specification-definitions/route.ts', ['POST']],
    ['app/api/admin/specification-definitions/[id]/route.ts', ['PATCH', 'DELETE']],
    ['app/api/admin/sources/route.ts', ['POST']],
    ['app/api/admin/sources/[id]/route.ts', ['PATCH']],
    ['app/api/admin/backups/route.ts', ['POST']],
    ['app/api/admin/backups/[name]/route.ts', ['DELETE']],
    ['app/api/admin/backups/restore/route.ts', ['POST']],
  ];
  for (const [file, methods] of mutationRoutes) {
    const src = read(file);
    assert.match(src, /requireAdminMutation/, `${file} must use requireAdminMutation for CSRF-protected mutation`);
    for (const method of methods) {
      assert.match(src, new RegExp(`export async function ${method}`), `${file} should still export ${method}`);
    }
  }
});

test('rota administrativa sem sessão: every read-only admin API route still requires an authenticated session', () => {
  const readRoutes = [
    'app/api/admin/products/route.ts',
    'app/api/admin/products/[id]/route.ts',
    'app/api/admin/brands/route.ts',
    'app/api/admin/brands/[id]/route.ts',
    'app/api/admin/categories/route.ts',
    'app/api/admin/categories/[id]/route.ts',
    'app/api/admin/specification-definitions/route.ts',
    'app/api/admin/specification-definitions/[id]/route.ts',
    'app/api/admin/sources/route.ts',
    'app/api/admin/sources/[id]/route.ts',
    'app/api/admin/products/[id]/specifications/route.ts',
    'app/api/admin/backups/route.ts',
    'app/api/admin/backups/[name]/route.ts',
  ];
  for (const file of readRoutes) {
    const src = read(file);
    assert.match(src, /requireAdmin/, `${file} GET handler must call requireAdmin`);
  }
});

test('páginas administrativas sem sessão redirecionam para o login (guarda central, não confiança só no frontend)', () => {
  const layout = read('app/admin/(authenticated)/layout.tsx');
  assert.match(layout, /adminSession/);
  assert.match(layout, /redirect\("\/admin\/login"\)/);
  // and every page under the group has no client-only/visual-only gating as a substitute
  const pages = [
    'app/admin/(authenticated)/page.tsx',
    'app/admin/(authenticated)/produtos/page.tsx',
    'app/admin/(authenticated)/marcas/page.tsx',
    'app/admin/(authenticated)/categorias/page.tsx',
    'app/admin/(authenticated)/especificacoes/page.tsx',
    'app/admin/(authenticated)/fontes/page.tsx',
    'app/admin/(authenticated)/backup/page.tsx',
  ];
  for (const file of pages) {
    const src = read(file);
    assert.doesNotMatch(src, /adminSession/, `${file} should rely on the group layout's guard, not repeat its own`);
  }
});

test('login route never logs credentials, hash, or session content', () => {
  const login = read('app/api/admin/login/route.ts');
  assert.doesNotMatch(login, /console\.(log|error|info|warn|debug)/);
});

test('create-admin-hash script never echoes the raw password, only the derived hash', () => {
  const script = read('scripts/create-admin-hash.mjs');
  assert.equal(script.includes('${password}'), false);
  assert.doesNotMatch(script, /console\.log\(password\)/);
});

test('.env* files are git-ignored (real secrets never get versioned)', () => {
  const gitignore = read('.gitignore');
  assert.match(gitignore, /\.env(\b|\*|\.local)/);
});
