// MVP-4A behavioral proof: the public frontend no longer contains decorative
// controls that don't do anything real, the homepage identifies as
// "Techno Blog" (not a fones-only site), the fones ranking/comparator stay
// reachable, no example/placeholder domain leaks into a properly-configured
// production response, and every rendered link/CTA has a real destination.
// Structural checks (source-text assertions) cover "this feature was
// actually removed from the code", which a behavioral test can't prove on
// its own (removing code isn't observable through HTTP the way adding it
// is) — real HTTP checks cover everything that's about what actually ships.
import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {readFileSync} from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

// ---------- Structural: fake/decorative controls are actually gone from the source ----------

test("busca do cabeçalho foi removida (sem input decorativo, sem IconSearch)", () => {
  const components = read("components.tsx");
  assert.doesNotMatch(components, /nav-search/);
  assert.doesNotMatch(components, /IconSearch/);
  assert.doesNotMatch(components, /placeholder="Buscar/);
});

test("newsletter foi removida (sem componente, sem uso em nenhuma página)", () => {
  const components = read("components.tsx");
  assert.doesNotMatch(components, /export function Newsletter/);
  assert.doesNotMatch(components, /Integração de e-mail ainda não configurada/);
  assert.doesNotMatch(read("app/page.tsx"), /Newsletter/);
  assert.doesNotMatch(read("app/melhores-fones-mercado-livre/page.tsx"), /Newsletter/);
});

test("guias por categoria falsos (todos apontando para o mesmo ranking) foram removidos", () => {
  const components = read("components.tsx");
  assert.doesNotMatch(components, /export function CategoryBands/);
  assert.doesNotMatch(components, /category-band/);
  assert.doesNotMatch(read("app/page.tsx"), /CategoryBands/);
});

test("nenhuma página institucional mantém texto de rascunho ou 'em configuração' visível", () => {
  const legal = read("app/[page]/page.tsx");
  assert.doesNotMatch(legal, /Rascunho inicial/i);
  assert.doesNotMatch(legal, /em configuração/i);
  assert.doesNotMatch(legal, /revise juridicamente/i);
});

test("header não linka mais para uma âncora #guias inexistente", () => {
  assert.doesNotMatch(read("components.tsx"), /#guias/);
  assert.doesNotMatch(read("app/page.tsx"), /id="guias"/);
});

// ---------- Behavioral: real HTTP server ----------

const PROJECT_ROOT = path.join(import.meta.dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techno-blog-frontend-readiness-"));
const dbPath = path.join(tempDir, "test.sqlite");
const REAL_DOMAIN = "https://www.exemplo-configurado-para-teste.com.br";
const PLACEHOLDER_DOMAIN = "technoblog-exemplo.com.br";

let serverProcess;
let baseUrl;

test.before(async () => {
  serverProcess = spawn(
    process.execPath,
    [path.join(PROJECT_ROOT, "node_modules/next/dist/bin/next"), "dev", "--port", "0"],
    {
      cwd: PROJECT_ROOT,
      // A real, explicitly-configured domain — this is the "properly
      // configured production" scenario for the placeholder-domain check
      // below (see lib/site.ts: NEXT_PUBLIC_SITE_URL is read as a normal
      // server-side env var by Server Components, not just inlined into
      // the client bundle, so setting it here is enough without a rebuild).
      env: {...process.env, DATABASE_PATH: dbPath, NEXT_PUBLIC_SITE_URL: REAL_DOMAIN},
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

test("home responde 200 e se identifica como Techno Blog, não como site exclusivo de fones", async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Techno Blog/);
  // The old hero framed the whole site as being about headphones
  // specifically ("O fone certo muda tudo o que você ouve.") — the
  // institutional rewrite must not still open with that framing.
  assert.doesNotMatch(html, /O fone certo muda tudo o que você ouve/);
});

test("home não contém input de busca nem seção de newsletter renderizados", async () => {
  const res = await fetch(`${baseUrl}/`);
  const html = await res.text();
  assert.doesNotMatch(html, /class="nav-search"/);
  assert.doesNotMatch(html, /class="newsletter/);
  assert.doesNotMatch(html, /Integração de e-mail ainda não configurada/);
});

test("ranking de fones continua acessível a partir da home", async () => {
  const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
  assert.equal(res.status, 200);
});

test("comparador continua acessível (seção presente na página do ranking)", async () => {
  const res = await fetch(`${baseUrl}/melhores-fones-mercado-livre`);
  const html = await res.text();
  assert.match(html, /id="comparador"/);
  assert.match(html, /Bancada de teste/);
});

test("com NEXT_PUBLIC_SITE_URL configurado, o domínio de placeholder nunca aparece nos metadados públicos", async () => {
  for (const url of ["/", "/melhores-fones-mercado-livre", "/sobre", "/robots.txt", "/sitemap.xml"]) {
    const res = await fetch(`${baseUrl}${url}`);
    const body = await res.text();
    assert.doesNotMatch(body, new RegExp(PLACEHOLDER_DOMAIN.replace(/\./g, "\\.")), `domínio de placeholder vazou em ${url}`);
  }
});

test("com NEXT_PUBLIC_SITE_URL configurado, o domínio real aparece no canonical e no sitemap", async () => {
  const home = await (await fetch(`${baseUrl}/`)).text();
  assert.match(home, new RegExp(`href="${REAL_DOMAIN.replace(/[.]/g, "\\.")}"`));
  const sitemap = await (await fetch(`${baseUrl}/sitemap.xml`)).text();
  assert.match(sitemap, new RegExp(REAL_DOMAIN.replace(/[.]/g, "\\.")));
});

function extractInternalHrefs(html) {
  const hrefs = new Set();
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1];
    if (href.startsWith("/") && !href.startsWith("//")) hrefs.add(href.split("#")[0] || "/");
  }
  return [...hrefs].filter(Boolean);
}

test("todos os links internos renderizados na home e no ranking têm destinos válidos (nenhum # vazio, nenhum 404)", async () => {
  const homeHtml = await (await fetch(`${baseUrl}/`)).text();
  const rankingHtml = await (await fetch(`${baseUrl}/melhores-fones-mercado-livre`)).text();

  assert.doesNotMatch(homeHtml, /href="#"/);
  assert.doesNotMatch(homeHtml, /href=""/);
  assert.doesNotMatch(rankingHtml, /href="#"/);
  assert.doesNotMatch(rankingHtml, /href=""/);

  const hrefs = new Set([...extractInternalHrefs(homeHtml), ...extractInternalHrefs(rankingHtml)]);
  assert.ok(hrefs.size > 5, "esperava vários links internos para checar");
  for (const href of hrefs) {
    const res = await fetch(`${baseUrl}${href}`, {redirect: "manual"});
    assert.ok(
      res.status === 200 || (res.status >= 300 && res.status < 400),
      `link interno "${href}" retornou ${res.status}`
    );
  }
});

test("navegação principal do cabeçalho é servidor-renderizada (presente no HTML sem depender de JS)", async () => {
  const html = await (await fetch(`${baseUrl}/`)).text();
  assert.match(html, /href="\/melhores-fones-mercado-livre">Ranking</);
  assert.match(html, /href="\/melhores-fones-mercado-livre#comparador">Comparador</);
  assert.match(html, /href="\/sobre">Sobre</);
});

test("rodapé só lista Contato quando um e-mail de contato está configurado", async () => {
  const html = await (await fetch(`${baseUrl}/`)).text();
  // No fixture DATABASE_PATH server above, NEXT_PUBLIC_CONTACT_EMAIL is
  // deliberately left unset — the footer must not promise a channel that
  // doesn't exist.
  assert.doesNotMatch(html, />Contato</);
});
