// Real HTTP behavioral tests for auth/CSRF on the rankings admin API.
//
// Why this isn't just "import the route handler and call it": requireAdmin()
// -> adminSession() calls cookies() from "next/headers", which reads Next's
// internal AsyncLocalStorage-based request store (workAsyncStorage /
// workUnitAsyncStorage). Outside a request actually routed through Next's
// own server, that store doesn't exist and cookies() throws synchronously
// (confirmed directly against node_modules/next/dist/server/request/cookies.js:
// "`cookies` was called outside a request scope"). Every route's outer
// try/catch swallows that throw into the same 401 this test is trying to
// verify — meaning a direct-import test would return 401 unconditionally,
// regardless of whether a valid session cookie was actually present. That's
// not a behavioral test, it's a coincidence with a passing assertion
// attached. Reconstructing Next's internal request-store shape by hand
// (createRequestStoreForAPI, workStore, RequestCookies adapters, etc.) is
// deep, undocumented, version-specific internal API — the actually robust
// way to exercise this code path is to run it, so this spawns the real
// `next dev` server against an isolated temporary database and drives it
// with real fetch() calls, including a real login to get a genuine signed
// session cookie.
import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const PROJECT_ROOT = path.join(import.meta.dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techno-blog-rankings-http-"));
const dbPath = path.join(tempDir, "test.sqlite");

const ADMIN_EMAIL = "http-test@local.test";
const ADMIN_PASSWORD = "http-behavioral-test-password-2026";
const salt = crypto.randomBytes(16).toString("hex");
// A real process env var, not a .env* file — never passes through Next's
// dotenv-expand, so the direct (unencoded) hash form is safe to use here.
const ADMIN_PASSWORD_HASH = `scrypt$${salt}$${crypto.scryptSync(ADMIN_PASSWORD, salt, 64).toString("hex")}`;
const ADMIN_SESSION_SECRET = crypto.randomBytes(32).toString("hex");

let serverProcess;
let baseUrl;
let sessionCookie;
let categoryId;
let sampleRankingId;

function dbSnapshot() {
  const db = new Database(dbPath, {readonly: true});
  const snapshot = {
    rankings: db.prepare("SELECT count(*) n FROM rankings").get().n,
    items: db.prepare("SELECT count(*) n FROM ranking_items").get().n,
  };
  db.close();
  return snapshot;
}

test.before(async () => {
  serverProcess = spawn(
    process.execPath,
    [path.join(PROJECT_ROOT, "node_modules/next/dist/bin/next"), "dev", "--port", "0"],
    {
      cwd: PROJECT_ROOT,
      env: {...process.env, DATABASE_PATH: dbPath, ADMIN_EMAIL, ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET},
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

  const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({email: ADMIN_EMAIL, password: ADMIN_PASSWORD}),
  });
  assert.equal(loginRes.status, 200, "setup: real login must succeed to get a genuine session cookie");
  const setCookie = loginRes.headers.get("set-cookie");
  assert.ok(setCookie, "setup: login must set a session cookie");
  sessionCookie = setCookie.split(";")[0];

  // Login itself never touches the database (credentials are env-var-only) —
  // the sqlite file at dbPath doesn't exist on disk until the server's own
  // db() runs for the first time, which only happens inside a route that
  // actually queries something. This authenticated read forces that
  // initialization (full migration chain + seed) before this file opens the
  // same path directly below.
  const warmupRes = await fetch(`${baseUrl}/api/admin/rankings`, {headers: {cookie: sessionCookie}});
  assert.equal(warmupRes.status, 200, "setup: authenticated read must succeed to initialize the database file");

  const db = new Database(dbPath, {readonly: true});
  categoryId = db.prepare("SELECT id FROM categories WHERE slug='fones-de-ouvido'").get().id;
  db.close();

  const createRes = await fetch(`${baseUrl}/api/admin/rankings`, {
    method: "POST",
    headers: {"content-type": "application/json", cookie: sessionCookie, origin: baseUrl},
    body: JSON.stringify({title: "Ranking HTTP de teste", slug: "http-test-ranking", categoryId, description: null, methodology: null, status: "draft", items: []}),
  });
  assert.equal(createRes.status, 201, "setup: authenticated same-origin create must succeed to have a real id for the [id] tests");
  sampleRankingId = (await createRes.json()).id;
});

test.after(async () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    await new Promise((resolve) => {
      serverProcess.once("exit", resolve);
      setTimeout(resolve, 5000); // don't hang the suite if the process is slow to exit
    });
  }
  try {
    fs.rmSync(tempDir, {recursive: true, force: true});
  } catch {
    // best-effort — see the equivalent note in admin-offers-price-migration.test.mjs
  }
});

test("GET /api/admin/rankings sem sessão -> 401", async () => {
  const res = await fetch(`${baseUrl}/api/admin/rankings`);
  assert.equal(res.status, 401);
});

test("POST /api/admin/rankings sem sessão -> 401, e não altera o banco", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/rankings`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({title: "sem sessão", slug: "sem-sessao", categoryId, status: "draft", items: []}),
  });
  assert.equal(res.status, 401);
  assert.deepEqual(dbSnapshot(), before);
});

test("GET /api/admin/rankings/[id] sem sessão -> 401", async () => {
  const res = await fetch(`${baseUrl}/api/admin/rankings/${sampleRankingId}`);
  assert.equal(res.status, 401);
});

test("PATCH /api/admin/rankings/[id] sem sessão -> 401, e não altera o banco", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/rankings/${sampleRankingId}`, {
    method: "PATCH",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({title: "hackeado sem sessão", slug: "http-test-ranking", categoryId, status: "draft", items: []}),
  });
  assert.equal(res.status, 401);
  assert.deepEqual(dbSnapshot(), before);
});

test("DELETE /api/admin/rankings/[id] sem sessão -> 401, e não altera o banco", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/rankings/${sampleRankingId}`, {method: "DELETE"});
  assert.equal(res.status, 401);
  assert.deepEqual(dbSnapshot(), before);
});

test("POST autenticado com Origin inválido -> 403, e não altera o banco", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/rankings`, {
    method: "POST",
    headers: {"content-type": "application/json", cookie: sessionCookie, origin: "https://evil.example"},
    body: JSON.stringify({title: "csrf create", slug: "csrf-create-attempt", categoryId, status: "draft", items: []}),
  });
  assert.equal(res.status, 403);
  assert.deepEqual(dbSnapshot(), before);
});

test("PATCH autenticado com Origin inválido -> 403, e não altera o banco", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/rankings/${sampleRankingId}`, {
    method: "PATCH",
    headers: {"content-type": "application/json", cookie: sessionCookie, origin: "https://evil.example"},
    body: JSON.stringify({title: "csrf patch", slug: "http-test-ranking", categoryId, status: "draft", items: []}),
  });
  assert.equal(res.status, 403);
  assert.deepEqual(dbSnapshot(), before);
});

test("DELETE autenticado com Origin inválido -> 403, e não altera o banco", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/rankings/${sampleRankingId}`, {
    method: "DELETE",
    headers: {cookie: sessionCookie, origin: "https://evil.example"},
  });
  assert.equal(res.status, 403);
  assert.deepEqual(dbSnapshot(), before);
});

test("controle: a mesma exclusão, com sessão válida e Origin correto, realmente funciona — prova que os 401/403 acima não são falsos positivos", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/rankings/${sampleRankingId}`, {
    method: "DELETE",
    headers: {cookie: sessionCookie, origin: baseUrl},
  });
  assert.equal(res.status, 200);
  const after = dbSnapshot();
  assert.equal(after.rankings, before.rankings - 1);
});
