// Proves ADMIN_ALLOWED_ORIGINS end-to-end against the actual production
// artifact (`node .next/standalone/server.js`, exactly what Dockerfile's
// CMD runs) — not `next dev`. This is the only way to catch the class of
// bug this env var replaced: comparing the Origin header against Next's own
// req.url worked fine under `next dev` (and in every other test file here)
// but silently rejected every legitimate admin mutation once deployed
// standalone, because req.url's origin reflected the process's HOSTNAME
// bind address instead of the public domain. See the MVP-4A hardening
// audit for the full writeup.
//
// The server here is deliberately started with HOSTNAME unset (so it binds
// wherever Node defaults to, same as a real container) and
// ADMIN_ALLOWED_ORIGINS set to a *public-looking* domain that has nothing
// to do with how the test actually connects (localhost:<port>) — the
// request's Origin header is set to that public domain explicitly, the way
// a real browser's would be after a reverse proxy terminates TLS for it.
// If this passes, the fix does not depend on HOSTNAME, on the request's
// Host header, or on the port/interface the process happens to be reachable
// on.
import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync, spawn} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const PROJECT_ROOT = path.join(import.meta.dirname, "..");
const STANDALONE_DIR = path.join(PROJECT_ROOT, ".next", "standalone");
const PUBLIC_ORIGIN = "https://technoblog.esis.com.br"; // configured origin — never actually dialed

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techno-blog-standalone-origin-"));
const dbPath = path.join(tempDir, "test.sqlite");

const ADMIN_EMAIL = "standalone-test@local.test";
const ADMIN_PASSWORD = "standalone-origin-test-password-2026";
const salt = crypto.randomBytes(16).toString("hex");
const ADMIN_PASSWORD_HASH_BASE64 = Buffer.from(`scrypt$${salt}$${crypto.scryptSync(ADMIN_PASSWORD, salt, 64).toString("hex")}`).toString("base64");
const ADMIN_SESSION_SECRET = crypto.randomBytes(32).toString("hex");

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
let baseUrl; // where the test actually connects — irrelevant to the origin check
let cookie;

test.before(
  async () => {
    // Real build — this is the whole point (see file header). Slow (~20-30s)
    // but a `next dev`-based test cannot exercise the standalone server code
    // path at all.
    execFileSync(process.execPath, [path.join(PROJECT_ROOT, "node_modules/next/dist/bin/next"), "build"], {
      cwd: PROJECT_ROOT,
      env: {...process.env, DATABASE_PATH: dbPath},
      stdio: "pipe",
    });

    // Mirrors the Dockerfile's COPY steps — `next build` with output:
    // "standalone" does not include these on its own.
    fs.cpSync(path.join(PROJECT_ROOT, "public"), path.join(STANDALONE_DIR, "public"), {recursive: true});
    fs.mkdirSync(path.join(STANDALONE_DIR, ".next", "static"), {recursive: true});
    fs.cpSync(path.join(PROJECT_ROOT, ".next", "static"), path.join(STANDALONE_DIR, ".next", "static"), {recursive: true});

    const port = await getFreePort();
    baseUrl = `http://localhost:${port}`;

    serverProcess = spawn(process.execPath, ["server.js"], {
      cwd: STANDALONE_DIR,
      env: {
        ...process.env,
        // HOSTNAME deliberately NOT set — falls back to whatever Node/Next's
        // standalone server defaults to (0.0.0.0-equivalent), same as a
        // container with no explicit hostname. This is the exact
        // misconfiguration that broke the old req.url-based check.
        HOSTNAME: undefined,
        PORT: String(port),
        NODE_ENV: "production",
        DATABASE_PATH: dbPath,
        ADMIN_EMAIL,
        ADMIN_PASSWORD_HASH_BASE64,
        ADMIN_SESSION_SECRET,
        ADMIN_ALLOWED_ORIGINS: PUBLIC_ORIGIN,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    await new Promise((resolve, reject) => {
      let out = "";
      const timeout = setTimeout(() => reject(new Error(`timeout waiting for standalone server to start. Output so far:\n${out}`)), 30000);
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
      serverProcess.on("exit", (code) => reject(new Error(`standalone server exited early with code ${code}. Output:\n${out}`)));
    });
    // "Ready" is logged before the very first request is guaranteed
    // servable in this Next version — same allowance the manual audit
    // needed; without it the first fetch can race a still-warming route.
    await new Promise((r) => setTimeout(r, 1500));

    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({email: ADMIN_EMAIL, password: ADMIN_PASSWORD}),
    });
    assert.equal(loginRes.status, 200, "setup: login must succeed against the standalone server");
    cookie = loginRes.headers.get("set-cookie").split(";")[0];
  },
  {timeout: 120000}
);

test.after(
  async () => {
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
  },
  {timeout: 15000}
);

test("standalone: páginas públicas respondem normalmente (home, sitemap, robots)", async () => {
  for (const url of ["/", "/sitemap.xml", "/robots.txt"]) {
    const res = await fetch(`${baseUrl}${url}`);
    assert.equal(res.status, 200, `${url} deveria responder 200`);
  }
});

test("standalone: mutação sem Origin -> 403 (rejeitada, não mais tratada como same-origin)", async () => {
  const res = await fetch(`${baseUrl}/api/admin/homepage-blocks`, {
    method: "POST",
    headers: {"content-type": "application/json", cookie},
    body: JSON.stringify({title: "sem origin", contentMode: "text", columns: 2, displayOrder: 0, status: "draft", items: []}),
  });
  assert.equal(res.status, 403);
});

test("standalone: mutação com Origin do bind address (http://localhost:porta) -> 403 (a causa raiz do bug antigo)", async () => {
  const res = await fetch(`${baseUrl}/api/admin/homepage-blocks`, {
    method: "POST",
    headers: {"content-type": "application/json", cookie, origin: baseUrl},
    body: JSON.stringify({title: "origin do bind", contentMode: "text", columns: 2, displayOrder: 0, status: "draft", items: []}),
  });
  assert.equal(res.status, 403, "a origin de bind/conexão nunca deve ser aceita — só a origin pública configurada");
});

test("standalone: login, criação, edição, exclusão e upload funcionam com a Origin pública configurada, servidor ligado sem HOSTNAME de domínio", async () => {
  const createRes = await fetch(`${baseUrl}/api/admin/homepage-blocks`, {
    method: "POST",
    headers: {"content-type": "application/json", cookie, origin: PUBLIC_ORIGIN},
    body: JSON.stringify({title: "Bloco standalone", contentMode: "text", columns: 3, displayOrder: 0, status: "draft", items: []}),
  });
  assert.equal(createRes.status, 201, "criação deveria funcionar com a origin pública configurada");
  const block = await createRes.json();

  const patchRes = await fetch(`${baseUrl}/api/admin/homepage-blocks/${block.id}`, {
    method: "PATCH",
    headers: {"content-type": "application/json", cookie, origin: PUBLIC_ORIGIN},
    body: JSON.stringify({title: "Bloco standalone editado", contentMode: "text", columns: 3, displayOrder: 0, status: "draft", items: []}),
  });
  assert.equal(patchRes.status, 200, "edição deveria funcionar com a origin pública configurada");

  const jpeg = await sharp({create: {width: 4, height: 4, channels: 3, background: {r: 100, g: 100, b: 200}}}).jpeg().toBuffer();
  const form = new FormData();
  form.set("image", new Blob([jpeg], {type: "image/jpeg"}), "standalone.jpg");
  const uploadRes = await fetch(`${baseUrl}/api/admin/media`, {method: "POST", headers: {cookie, origin: PUBLIC_ORIGIN}, body: form});
  assert.equal(uploadRes.status, 201, "upload deveria funcionar com a origin pública configurada");

  const deleteRes = await fetch(`${baseUrl}/api/admin/homepage-blocks/${block.id}`, {method: "DELETE", headers: {cookie, origin: PUBLIC_ORIGIN}});
  assert.equal(deleteRes.status, 200, "exclusão deveria funcionar com a origin pública configurada");
});
