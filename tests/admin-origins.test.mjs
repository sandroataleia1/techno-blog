// Behavioral tests for the ADMIN_ALLOWED_ORIGINS allowlist — the CSRF
// mechanism that replaced comparing the request's Origin header against
// Next's own req.url. That comparison broke in a standalone/Docker
// deployment: req.url's origin reflects the process's HOSTNAME bind
// address (0.0.0.0, or a Docker-assigned container id), never the real
// public domain, so every legitimate same-origin mutation was rejected —
// see the MVP-4A hardening audit. ADMIN_ALLOWED_ORIGINS is an explicit,
// ops-configured list instead: never derived from Host/X-Forwarded-Host or
// any other client-supplied signal.
import test from "node:test";
import assert from "node:assert/strict";
import {isAllowedOrigin, originAllowed, parseAllowedOrigins} from "../lib/admin.ts";

// ---------- parseAllowedOrigins: config parsing ----------

test("configuração ausente: string vazia ou undefined produz allowlist vazia", () => {
  assert.deepEqual(parseAllowedOrigins(undefined), []);
  assert.deepEqual(parseAllowedOrigins(""), []);
  assert.deepEqual(parseAllowedOrigins("   "), []);
});

test("origin autorizada: uma única origin https válida é aceita e normalizada", () => {
  assert.deepEqual(parseAllowedOrigins("https://technoblog.esis.com.br"), ["https://technoblog.esis.com.br"]);
});

test("múltiplas origins permitidas: lista separada por vírgula, com espaços, é aceita inteira", () => {
  const raw = "https://technoblog.esis.com.br, https://admin.technoblog.esis.com.br ,http://localhost:3000";
  assert.deepEqual(parseAllowedOrigins(raw), ["https://technoblog.esis.com.br", "https://admin.technoblog.esis.com.br", "http://localhost:3000"]);
});

test("configuração inválida: valor totalmente inutilizável vira allowlist vazia (falha fechada)", () => {
  assert.deepEqual(parseAllowedOrigins("não é uma url"), []);
  assert.deepEqual(parseAllowedOrigins("technoblog.esis.com.br"), []); // sem scheme não é uma origin absoluta
  assert.deepEqual(parseAllowedOrigins("ftp://technoblog.esis.com.br"), []); // scheme não é http/https
  assert.deepEqual(parseAllowedOrigins("javascript:alert(1)"), []);
});

test("configuração parcialmente inválida: entradas malformadas são descartadas, as válidas continuam valendo", () => {
  assert.deepEqual(parseAllowedOrigins("https://bom.com,não é url,https://tambem-bom.com"), ["https://bom.com", "https://tambem-bom.com"]);
});

test("origin com caminho, query, hash ou credenciais não é uma origin absoluta — rejeitada", () => {
  assert.deepEqual(parseAllowedOrigins("https://technoblog.esis.com.br/admin"), []);
  assert.deepEqual(parseAllowedOrigins("https://technoblog.esis.com.br?x=1"), []);
  assert.deepEqual(parseAllowedOrigins("https://technoblog.esis.com.br#top"), []);
  assert.deepEqual(parseAllowedOrigins("https://user:pass@technoblog.esis.com.br"), []);
});

test("origin com barra final é aceita e normalizada sem a barra (mesma origin canônica)", () => {
  assert.deepEqual(parseAllowedOrigins("https://technoblog.esis.com.br/"), ["https://technoblog.esis.com.br"]);
});

// ---------- isAllowedOrigin: matching exato, sem includes/endsWith/curinga ----------

const ALLOWED = ["https://technoblog.esis.com.br"];

test("origin autorizada: bate exatamente com a allowlist", () => {
  assert.equal(isAllowedOrigin("https://technoblog.esis.com.br", ALLOWED), true);
});

test("origin não autorizada: domínio completamente diferente é rejeitado", () => {
  assert.equal(isAllowedOrigin("https://outro-site.com", ALLOWED), false);
});

test("origin ausente: null é sempre rejeitado, mesmo com allowlist configurada", () => {
  assert.equal(isAllowedOrigin(null, ALLOWED), false);
});

test("origin malformada: string que não é uma URL válida é rejeitada", () => {
  assert.equal(isAllowedOrigin("não-é-uma-origin", ALLOWED), false);
  assert.equal(isAllowedOrigin("null", ALLOWED), false);
});

test("domínio semelhante malicioso: subdomínio, sufixo ou prefixo parecido nunca engana o match exato", () => {
  assert.equal(isAllowedOrigin("https://technoblog.esis.com.br.evil.com", ALLOWED), false); // sufixo falso — pegaria com endsWith ingênuo
  assert.equal(isAllowedOrigin("https://eviltechnoblog.esis.com.br", ALLOWED), false); // prefixo colado — pegaria com includes ingênuo
  assert.equal(isAllowedOrigin("https://evil.technoblog.esis.com.br", ALLOWED), false); // subdomínio não listado
  assert.equal(isAllowedOrigin("https://technoblog.esis.com.br.attacker.io/technoblog.esis.com.br", ALLOWED), false);
});

test("porta diferente: mesma origin configurada mas porta explícita diferente é rejeitada", () => {
  assert.equal(isAllowedOrigin("https://technoblog.esis.com.br:8443", ALLOWED), false);
});

test("porta implícita bate com a porta padrão do scheme (443 para https) sem precisar ser escrita", () => {
  assert.equal(isAllowedOrigin("https://technoblog.esis.com.br:443", ALLOWED), true);
});

test("protocolo diferente: http contra uma allowlist só com https é rejeitado", () => {
  assert.equal(isAllowedOrigin("http://technoblog.esis.com.br", ALLOWED), false);
});

test("múltiplas origins permitidas: qualquer uma da lista é aceita, o resto continua rejeitado", () => {
  const allowed = ["https://technoblog.esis.com.br", "http://localhost:3000"];
  assert.equal(isAllowedOrigin("https://technoblog.esis.com.br", allowed), true);
  assert.equal(isAllowedOrigin("http://localhost:3000", allowed), true);
  assert.equal(isAllowedOrigin("http://localhost:4000", allowed), false);
});

test("configuração inválida/ausente: allowlist vazia rejeita até uma origin que parece plausível", () => {
  assert.equal(isAllowedOrigin("https://technoblog.esis.com.br", []), false);
});

// ---------- originAllowed(req, env): a função realmente usada por requireAdminMutation ----------

test("originAllowed lê ADMIN_ALLOWED_ORIGINS do env injetado, nunca de Host/X-Forwarded-Host", () => {
  const env = {ADMIN_ALLOWED_ORIGINS: "https://technoblog.esis.com.br"};
  const spoofedHostReq = new Request("http://0.0.0.0:3000/api/admin/rankings", {
    headers: {origin: "https://technoblog.esis.com.br", host: "attacker.example", "x-forwarded-host": "attacker.example"},
  });
  assert.equal(originAllowed(spoofedHostReq, env), true, "Host/X-Forwarded-Host forjados não devem afetar o resultado — só a Origin real importa");
});

test("originAllowed em produção sem ADMIN_ALLOWED_ORIGINS configurado falha fechado (rejeita tudo)", () => {
  const env = {NODE_ENV: "production"};
  const req = new Request("https://technoblog.esis.com.br/api/admin/rankings", {headers: {origin: "https://technoblog.esis.com.br"}});
  assert.equal(originAllowed(req, env), false);
});

// Execução real com o servidor standalone (login/CRUD/upload contra a
// origin pública configurada, com HOSTNAME ainda em 0.0.0.0) está em
// tests/admin-origins-standalone.test.mjs — precisa de `next build` de
// verdade, por isso fica em um arquivo separado e mais lento.
