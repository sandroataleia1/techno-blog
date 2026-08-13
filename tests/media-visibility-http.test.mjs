// Real HTTP behavioral tests for GET /api/media/[id]'s publication gate —
// same technique as tests/admin-rankings-http.test.mjs (cookies()/
// adminSession() need a real request scope, so this spawns a real `next dev`
// server against an isolated temporary database rather than importing the
// route handler directly).
//
// Before this hardening, mediaAssetForPublic() served any existing row with
// no gate at all — an image uploaded for a still-unpublished (or since
// abandoned) block item was reachable by anyone who guessed/observed its id.
// This proves the fix: anonymous access now requires the media to be
// referenced by an item on a *published* block; everything else 404s for an
// anonymous caller and 200s for an authenticated admin (with a private,
// never-cached response).
import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const PROJECT_ROOT = path.join(import.meta.dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techno-blog-media-visibility-"));
const dbPath = path.join(tempDir, "test.sqlite");

const ADMIN_EMAIL = "media-visibility@local.test";
const ADMIN_PASSWORD = "media-visibility-test-password-2026";
const salt = crypto.randomBytes(16).toString("hex");
const ADMIN_PASSWORD_HASH = `scrypt$${salt}$${crypto.scryptSync(ADMIN_PASSWORD, salt, 64).toString("hex")}`;
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
let baseUrl;
let cookie;

// Each fixture must be genuinely distinct content: saveMediaAsset() dedupes
// by hash (see lib/media.ts), so uploading the same bytes for "published"
// and "draft" fixtures would silently collapse them into a single row —
// the draft/orphan fixtures would then read as published too, since the
// row really would be referenced by the published block. A solid-color
// square per fixture guarantees a different hash each time.
async function makeJpeg(background) {
  return sharp({create: {width: 4, height: 4, channels: 3, background}}).jpeg().toBuffer();
}

async function uploadImage(bytes) {
  const form = new FormData();
  form.set("image", new Blob([bytes], {type: "image/jpeg"}), "sample.jpg");
  const res = await fetch(`${baseUrl}/api/admin/media`, {method: "POST", headers: {cookie, origin: baseUrl}, body: form});
  assert.equal(res.status, 201, "setup: authorized upload must succeed");
  return (await res.json()).id;
}

async function createBlock({status, imageId}) {
  const res = await fetch(`${baseUrl}/api/admin/homepage-blocks`, {
    method: "POST",
    headers: {"content-type": "application/json", cookie, origin: baseUrl},
    body: JSON.stringify({
      title: `Bloco ${status} de teste`,
      contentMode: "photo",
      columns: 3,
      displayOrder: 0,
      status,
      items: [{linkUrl: "/melhores-fones-mercado-livre", text: "", imageId}],
    }),
  });
  assert.equal(res.status, 201, `setup: creating a ${status} block must succeed`);
  return res.json();
}

let publishedImageId;
let draftImageId;
let orphanImageId;
let sharedImageId;

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
  cookie = loginRes.headers.get("set-cookie").split(";")[0];

  publishedImageId = await uploadImage(await makeJpeg({r: 220, g: 20, b: 20}));
  await createBlock({status: "published", imageId: publishedImageId});

  draftImageId = await uploadImage(await makeJpeg({r: 20, g: 180, b: 20}));
  await createBlock({status: "draft", imageId: draftImageId});

  orphanImageId = await uploadImage(await makeJpeg({r: 20, g: 20, b: 220})); // uploaded, never referenced by any block

  // Same media referenced by two items across two different published
  // blocks — dedupe means both items share one media_assets row.
  sharedImageId = await uploadImage(await makeJpeg({r: 220, g: 220, b: 20}));
  await createBlock({status: "published", imageId: sharedImageId});
  await createBlock({status: "published", imageId: sharedImageId});
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

test("mídia referenciada por bloco publicado: acesso anônimo 200, cache público", async () => {
  const res = await fetch(`${baseUrl}/api/media/${publishedImageId}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/webp");
  assert.match(res.headers.get("cache-control") || "", /public/);
});

test("mídia de bloco draft: acesso anônimo 404", async () => {
  const res = await fetch(`${baseUrl}/api/media/${draftImageId}`);
  assert.equal(res.status, 404);
});

test("mídia sem referência (upload nunca associado a um bloco): acesso anônimo 404", async () => {
  const res = await fetch(`${baseUrl}/api/media/${orphanImageId}`);
  assert.equal(res.status, 404);
});

test("mídia inexistente: acesso anônimo 404, igual ao caso draft/sem-referência (não dá pra distinguir os três)", async () => {
  const res = await fetch(`${baseUrl}/api/media/${crypto.randomUUID()}`);
  assert.equal(res.status, 404);
});

test("administrador autenticado vê mídia publicada, com cache privado/no-store", async () => {
  const res = await fetch(`${baseUrl}/api/media/${publishedImageId}`, {headers: {cookie}});
  assert.equal(res.status, 200);
  const cacheControl = res.headers.get("cache-control") || "";
  assert.match(cacheControl, /private/);
  assert.match(cacheControl, /no-store/);
});

test("administrador autenticado vê mídia de bloco draft (ainda não publicada), com cache privado/no-store", async () => {
  const res = await fetch(`${baseUrl}/api/media/${draftImageId}`, {headers: {cookie}});
  assert.equal(res.status, 200);
  const cacheControl = res.headers.get("cache-control") || "";
  assert.match(cacheControl, /private/);
  assert.match(cacheControl, /no-store/);
});

test("administrador autenticado vê mídia sem referência nenhuma, com cache privado/no-store", async () => {
  const res = await fetch(`${baseUrl}/api/media/${orphanImageId}`, {headers: {cookie}});
  assert.equal(res.status, 200);
  const cacheControl = res.headers.get("cache-control") || "";
  assert.match(cacheControl, /private/);
  assert.match(cacheControl, /no-store/);
});

test("administrador autenticado: mídia inexistente continua 404", async () => {
  const res = await fetch(`${baseUrl}/api/media/${crypto.randomUUID()}`, {headers: {cookie}});
  assert.equal(res.status, 404);
});

test("mídia compartilhada por mais de um item/bloco publicado continua acessível — nada foi apagado ou quebrado pela junção", async () => {
  const res = await fetch(`${baseUrl}/api/media/${sharedImageId}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/webp");
});
