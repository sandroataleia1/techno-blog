// Real HTTP behavioral tests for auth/CSRF/error-shape on the homepage
// blocks admin API — same technique and rationale as
// tests/admin-rankings-http.test.mjs (see that file's header comment for
// why this has to spawn a real `next dev` server rather than import the
// route handlers directly: cookies() throws outside a real request scope).
import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const PROJECT_ROOT = path.join(import.meta.dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techno-blog-homepage-blocks-http-"));
const dbPath = path.join(tempDir, "test.sqlite");

const ADMIN_EMAIL = "http-test@local.test";
const ADMIN_PASSWORD = "http-behavioral-test-password-2026";
const salt = crypto.randomBytes(16).toString("hex");
const ADMIN_PASSWORD_HASH = `scrypt$${salt}$${crypto.scryptSync(ADMIN_PASSWORD, salt, 64).toString("hex")}`;
const ADMIN_SESSION_SECRET = crypto.randomBytes(32).toString("hex");

// ADMIN_ALLOWED_ORIGINS (see lib/admin.ts) must be known *before* the server
// spawns — it's no longer derived from whatever port `next dev --port 0`
// happens to pick, so a free port is reserved synchronously first and
// baseUrl/ADMIN_ALLOWED_ORIGINS are both built from that same known value.
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, () => {
      const {port} = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

let serverProcess;
let baseUrl;
let sessionCookie;
let sampleBlockId;

function dbSnapshot() {
  const db = new Database(dbPath, {readonly: true});
  const snapshot = {
    blocks: db.prepare("SELECT count(*) n FROM homepage_blocks").get().n,
    items: db.prepare("SELECT count(*) n FROM homepage_block_items").get().n,
  };
  db.close();
  return snapshot;
}

test.before(async () => {
  const port = await getFreePort();
  baseUrl = `http://localhost:${port}`;

  serverProcess = spawn(
    process.execPath,
    [path.join(PROJECT_ROOT, "node_modules/next/dist/bin/next"), "dev", "--port", String(port)],
    {
      cwd: PROJECT_ROOT,
      env: {...process.env, DATABASE_PATH: dbPath, ADMIN_EMAIL, ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET, ADMIN_ALLOWED_ORIGINS: baseUrl},
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  await new Promise((resolve, reject) => {
    let out = "";
    const timeout = setTimeout(() => reject(new Error(`timeout waiting for dev server to start. Output so far:\n${out}`)), 45000);
    const onData = (chunk) => {
      out += chunk.toString();
      if (/Ready in/.test(out)) {
        clearTimeout(timeout);
        resolve();
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

  const warmupRes = await fetch(`${baseUrl}/api/admin/homepage-blocks`, {headers: {cookie: sessionCookie}});
  assert.equal(warmupRes.status, 200, "setup: authenticated read must succeed to initialize the database file");

  const createRes = await fetch(`${baseUrl}/api/admin/homepage-blocks`, {
    method: "POST",
    headers: {"content-type": "application/json", cookie: sessionCookie, origin: baseUrl},
    body: JSON.stringify({title: "Bloco HTTP de teste", contentMode: "text", columns: 3, displayOrder: 0, status: "draft", items: []}),
  });
  assert.equal(createRes.status, 201, "setup: authenticated same-origin create must succeed to have a real id for the [id] tests");
  sampleBlockId = (await createRes.json()).id;
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
    // best-effort
  }
});

const UNAUTHORIZED_BODY = {error: "Não autorizado"};
const FORBIDDEN_BODY = {error: "Requisição proibida"};
const BAD_BODY_RESPONSE = {error: "Corpo da requisição inválido."};

test("GET /api/admin/homepage-blocks sem sessão -> 401, corpo genérico", async () => {
  const res = await fetch(`${baseUrl}/api/admin/homepage-blocks`);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), UNAUTHORIZED_BODY);
});

test("POST /api/admin/homepage-blocks sem sessão -> 401, corpo genérico, e não altera o banco", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/homepage-blocks`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({title: "sem sessão", contentMode: "text", columns: 3, status: "draft", items: []}),
  });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), UNAUTHORIZED_BODY);
  assert.deepEqual(dbSnapshot(), before);
});

test("GET /api/admin/homepage-blocks/[id] sem sessão -> 401, corpo genérico", async () => {
  const res = await fetch(`${baseUrl}/api/admin/homepage-blocks/${sampleBlockId}`);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), UNAUTHORIZED_BODY);
});

test("PATCH /api/admin/homepage-blocks/[id] sem sessão -> 401, corpo genérico, e não altera o banco", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/homepage-blocks/${sampleBlockId}`, {
    method: "PATCH",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({title: "hackeado sem sessão", contentMode: "text", columns: 3, status: "draft", items: []}),
  });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), UNAUTHORIZED_BODY);
  assert.deepEqual(dbSnapshot(), before);
});

test("DELETE /api/admin/homepage-blocks/[id] sem sessão -> 401, corpo genérico, e não altera o banco", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/homepage-blocks/${sampleBlockId}`, {method: "DELETE"});
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), UNAUTHORIZED_BODY);
  assert.deepEqual(dbSnapshot(), before);
});

test("POST autenticado com Origin inválido -> 403, corpo genérico, e não altera o banco", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/homepage-blocks`, {
    method: "POST",
    headers: {"content-type": "application/json", cookie: sessionCookie, origin: "https://evil.example"},
    body: JSON.stringify({title: "csrf create", contentMode: "text", columns: 3, status: "draft", items: []}),
  });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), FORBIDDEN_BODY);
  assert.deepEqual(dbSnapshot(), before);
});

test("PATCH autenticado com Origin inválido -> 403, corpo genérico, e não altera o banco", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/homepage-blocks/${sampleBlockId}`, {
    method: "PATCH",
    headers: {"content-type": "application/json", cookie: sessionCookie, origin: "https://evil.example"},
    body: JSON.stringify({title: "csrf patch", contentMode: "text", columns: 3, status: "draft", items: []}),
  });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), FORBIDDEN_BODY);
  assert.deepEqual(dbSnapshot(), before);
});

test("DELETE autenticado com Origin inválido -> 403, corpo genérico, e não altera o banco", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/homepage-blocks/${sampleBlockId}`, {
    method: "DELETE",
    headers: {cookie: sessionCookie, origin: "https://evil.example"},
  });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), FORBIDDEN_BODY);
  assert.deepEqual(dbSnapshot(), before);
});

test("POST autenticado com corpo JSON null -> 400, não um TypeError, e não altera o banco", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/homepage-blocks`, {
    method: "POST",
    headers: {"content-type": "application/json", cookie: sessionCookie, origin: baseUrl},
    body: "null",
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.deepEqual(body, BAD_BODY_RESPONSE);
  assert.doesNotMatch(body.error, /TypeError|Cannot read propert/i);
  assert.deepEqual(dbSnapshot(), before);
});

test("PATCH autenticado com JSON malformado -> 400, nunca a mensagem crua do parser", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/homepage-blocks/${sampleBlockId}`, {
    method: "PATCH",
    headers: {"content-type": "application/json", cookie: sessionCookie, origin: baseUrl},
    body: "{isso não é json",
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.deepEqual(body, BAD_BODY_RESPONSE);
  assert.doesNotMatch(body.error, /JSON|Unexpected token|position/i);
  assert.deepEqual(dbSnapshot(), before);
});

test("POST /api/admin/media sem sessão -> 401, corpo genérico", async () => {
  const form = new FormData();
  form.set("image", new Blob([new Uint8Array([1, 2, 3])], {type: "image/png"}), "x.png");
  const res = await fetch(`${baseUrl}/api/admin/media`, {method: "POST", body: form});
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), UNAUTHORIZED_BODY);
});

test("POST /api/admin/media autenticado com Origin inválido -> 403", async () => {
  const form = new FormData();
  form.set("image", new Blob([new Uint8Array([1, 2, 3])], {type: "image/png"}), "x.png");
  const res = await fetch(`${baseUrl}/api/admin/media`, {method: "POST", headers: {cookie: sessionCookie, origin: "https://evil.example"}, body: form});
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), FORBIDDEN_BODY);
});

test("controle: a mesma exclusão, com sessão válida e Origin correto, realmente funciona — prova que os 401/403 acima não são falsos positivos", async () => {
  const before = dbSnapshot();
  const res = await fetch(`${baseUrl}/api/admin/homepage-blocks/${sampleBlockId}`, {
    method: "DELETE",
    headers: {cookie: sessionCookie, origin: baseUrl},
  });
  assert.equal(res.status, 200);
  const after = dbSnapshot();
  assert.equal(after.blocks, before.blocks - 1);
});
