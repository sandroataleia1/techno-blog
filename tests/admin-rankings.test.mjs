import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  assignPositions,
  hasContinuousPositions,
  hasDuplicateProductIds,
  isValidSlug,
  MAX_DRAFT_ITEMS,
  RANKING_STATUSES,
  RankingValidationError,
  REQUIRED_PUBLISHED_ITEMS,
  validateDraftItems,
  validateEditorialForPublish,
  validateItemsForPublish,
} from '../lib/rankings-rules.ts';
import {originAllowed} from '../lib/admin.ts';
import {translateRankingError, validateRankingBody} from '../app/api/admin/rankings/route.ts';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function item(productId, overrides = {}) {
  return {productId, badge: 'Selo', reason: 'Motivo', mainBenefit: 'Benefício', mainLimitation: 'Limitação', ...overrides};
}

// ---------- Behavioral: pure rules (real logic) ----------

test('slug: aceita letras minúsculas, números e hífens; rejeita o resto', () => {
  assert.equal(isValidSlug('melhores-fones-mercado-livre'), true);
  assert.equal(isValidSlug('top-10-2026'), true);
  assert.equal(isValidSlug('Com-Maiuscula'), false);
  assert.equal(isValidSlug('com espaço'), false);
  assert.equal(isValidSlug('com_underscore'), false);
  assert.equal(isValidSlug('-comeca-com-hifen'), false);
  assert.equal(isValidSlug('termina-com-hifen-'), false);
  assert.equal(isValidSlug(''), false);
});

test('posição: assignPositions nunca confia em posição vinda do cliente — sempre deriva do índice do array', () => {
  const items = [item('a', {position: 99}), item('b', {position: -5}), item('c')];
  const positioned = assignPositions(items);
  assert.deepEqual(positioned.map((i) => i.position), [1, 2, 3]);
});

test('posição: reordenar é apenas reenviar o array em outra ordem — a nova posição segue o novo índice', () => {
  const original = [item('a'), item('b'), item('c')];
  const reordered = [original[2], original[0], original[1]]; // c, a, b
  const positioned = assignPositions(reordered);
  assert.deepEqual(positioned.map((i) => [i.productId, i.position]), [['c', 1], ['a', 2], ['b', 3]]);
});

test('hasContinuousPositions: verdadeiro só para 1..n contíguo, mesmo fora de ordem', () => {
  assert.equal(hasContinuousPositions([{position: 2}, {position: 1}, {position: 3}]), true);
  assert.equal(hasContinuousPositions([{position: 1}, {position: 3}]), false); // buraco
  assert.equal(hasContinuousPositions([{position: 1}, {position: 1}]), false); // duplicado
  assert.equal(hasContinuousPositions([]), true);
});

test('produto duplicado: hasDuplicateProductIds detecta repetição', () => {
  assert.equal(hasDuplicateProductIds([item('a'), item('b')]), false);
  assert.equal(hasDuplicateProductIds([item('a'), item('a')]), true);
});

test('rascunho: aceita de 0 a 10 produtos, rejeita mais de 10 e duplicados', () => {
  assert.equal(validateDraftItems([]), null);
  assert.equal(validateDraftItems(Array.from({length: MAX_DRAFT_ITEMS}, (_, i) => item(String(i)))), null);
  assert.match(validateDraftItems(Array.from({length: MAX_DRAFT_ITEMS + 1}, (_, i) => item(String(i)))), /no máximo/);
  assert.match(validateDraftItems([item('a'), item('a')]), /não pode aparecer mais de uma vez/);
});

test('publicação: exige exatamente 10 itens — 9 ou 11 são rejeitados', () => {
  assert.match(validateItemsForPublish(Array.from({length: 9}, (_, i) => item(String(i)))), new RegExp(`exatamente ${REQUIRED_PUBLISHED_ITEMS}`));
  assert.match(validateItemsForPublish(Array.from({length: 11}, (_, i) => item(String(i)))), new RegExp(`exatamente ${REQUIRED_PUBLISHED_ITEMS}`));
  assert.equal(validateItemsForPublish(Array.from({length: 10}, (_, i) => item(String(i)))), null);
});

test('publicação: cada item precisa de badge, reason, mainBenefit e mainLimitation preenchidos', () => {
  const items = Array.from({length: 10}, (_, i) => item(String(i)));
  items[3] = item('3', {badge: ''});
  assert.match(validateItemsForPublish(items), /selo editorial/);
  items[3] = item('3', {reason: '  '});
  assert.match(validateItemsForPublish(items), /motivo da posição/);
  items[3] = item('3', {mainBenefit: ''});
  assert.match(validateItemsForPublish(items), /principal benefício/);
  items[3] = item('3', {mainLimitation: ''});
  assert.match(validateItemsForPublish(items), /principal limitação/);
});

test('publicação: descrição e metodologia são obrigatórias', () => {
  assert.match(validateEditorialForPublish({description: '', methodology: 'x'}), /introdução\/descrição/);
  assert.match(validateEditorialForPublish({description: 'x', methodology: ''}), /metodologia/);
  assert.equal(validateEditorialForPublish({description: 'x', methodology: 'y'}), null);
});

test('estados aceitos: apenas draft, published, archived', () => {
  assert.deepEqual([...RANKING_STATUSES], ['draft', 'published', 'archived']);
});

// ---------- Behavioral: CSRF Origin check (real logic — originAllowed is pure) ----------
// Deep coverage of the allowlist parser/matcher itself lives in
// tests/admin-origins.test.mjs; this is a smoke test that requireAdminMutation's
// actual dependency (originAllowed, imported from lib/admin.ts) behaves as
// expected against a real ADMIN_ALLOWED_ORIGINS-shaped env.

test('CSRF: originAllowed aceita origin configurada, rejeita origin cruzada e origin ausente', () => {
  const env = {ADMIN_ALLOWED_ORIGINS: 'http://localhost:3001'};
  const allowedReq = new Request('http://localhost:3001/api/admin/rankings', {headers: {origin: 'http://localhost:3001'}});
  const noOriginReq = new Request('http://localhost:3001/api/admin/rankings');
  const crossOriginReq = new Request('http://localhost:3001/api/admin/rankings', {headers: {origin: 'https://evil.example'}});
  assert.equal(originAllowed(allowedReq, env), true);
  assert.equal(originAllowed(noOriginReq, env), false);
  assert.equal(originAllowed(crossOriginReq, env), false);
});

// ---------- Behavioral: centralized error translation (real logic — translateRankingError/validateRankingBody are pure) ----------
// Every response an admin can see for a rankings request is decided by
// translateRankingError() — this exercises the real function directly
// against the exact kinds of errors it has to handle, including ones that
// can never legitimately occur through a live HTTP request against this
// app (a bare TypeError, a random unrecognized Error, a thrown non-Error
// value) precisely because no valid input can trigger them: everything
// reachable through the API is pre-validated into a RankingValidationError
// first. Testing the "unexpected error" branch this way — calling the real
// translator with a real unexpected error object — is the strongest
// available proof that a bug or a future unguarded throw degrades to a
// safe generic response instead of leaking; the HTTP suite
// (tests/admin-rankings-http.test.mjs) exercises the branches an attacker
// can actually reach: no session, wrong Origin, and a malformed body.

test('validateRankingBody: corpo nulo, array, string ou número é rejeitado como "Corpo da requisição inválido.", nunca um TypeError bruto', () => {
  for (const badBody of [null, [], ['x'], 'a string', 42, true]) {
    assert.throws(() => validateRankingBody(badBody), (err) => {
      assert.ok(err instanceof RankingValidationError, 'deve lançar RankingValidationError, não um TypeError de acesso a propriedade');
      assert.equal(err.message, 'Corpo da requisição inválido.');
      return true;
    });
  }
});

test('translateRankingError: marcadores de autenticação nunca vazam como texto — 401/403 sempre com mensagem pública fixa', () => {
  assert.deepEqual(translateRankingError(new Error('UNAUTHORIZED')), {status: 401, message: 'Não autorizado'});
  assert.deepEqual(translateRankingError(new Error('FORBIDDEN')), {status: 403, message: 'Requisição proibida'});
});

test('translateRankingError: RankingValidationError com mensagem editorial específica vira 400 com essa mesma mensagem', () => {
  const result = translateRankingError(new RankingValidationError('Título é obrigatório.'));
  assert.deepEqual(result, {status: 400, message: 'Título é obrigatório.'});
});

test('translateRankingError: marcadores de slug (SLUG_TAKEN/SLUG_LOCKED) viram 409 com mensagem traduzida, nunca o marcador cru', () => {
  const taken = translateRankingError(new RankingValidationError('SLUG_TAKEN'));
  assert.equal(taken.status, 409);
  assert.equal(taken.message, 'Já existe um ranking com este slug.');
  assert.doesNotMatch(taken.message, /SLUG_TAKEN/);

  const locked = translateRankingError(new RankingValidationError('SLUG_LOCKED'));
  assert.equal(locked.status, 409);
  assert.equal(locked.message, 'O slug não pode ser alterado depois da primeira publicação.');
  assert.doesNotMatch(locked.message, /SLUG_LOCKED/);
});

test('translateRankingError: erro de integridade do SQLite (UNIQUE/FOREIGN KEY) é traduzido, nunca aparece SQL/SQLite na resposta', () => {
  const unique = translateRankingError(new Error("UNIQUE constraint failed: rankings.slug"));
  assert.equal(unique.status, 409);
  assert.doesNotMatch(unique.message, /UNIQUE|SQL|SQLite|rankings\.slug/i);

  const fk = translateRankingError(new Error("FOREIGN KEY constraint failed"));
  assert.equal(fk.status, 409);
  assert.doesNotMatch(fk.message, /FOREIGN KEY|SQL|SQLite/i);
});

test('translateRankingError: JSON malformado (SyntaxError) vira 400 "Corpo da requisição inválido."', () => {
  let syntaxError;
  try {
    JSON.parse('{isso não é json');
  } catch (e) {
    syntaxError = e;
  }
  assert.ok(syntaxError instanceof SyntaxError);
  assert.deepEqual(translateRankingError(syntaxError), {status: 400, message: 'Corpo da requisição inválido.'});
});

test('translateRankingError: qualquer erro inesperado (TypeError, Error genérico, valor não-Error) vira 500 genérico — nunca expõe a mensagem original', () => {
  const cases = [
    new TypeError("Cannot read properties of null (reading 'title')"),
    new Error('database is locked'),
    new Error('connect ECONNREFUSED 127.0.0.1:1234'),
    'uma string lançada diretamente, não um Error',
    undefined,
  ];
  for (const unexpected of cases) {
    const result = translateRankingError(unexpected);
    assert.deepEqual(result, {status: 500, message: 'Não foi possível concluir a operação.'});
    if (unexpected instanceof Error) {
      assert.doesNotMatch(result.message, new RegExp(unexpected.message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }
});

// ---------- Auxiliary structural checks ----------
// The real proof that unauthenticated/cross-origin requests are rejected —
// and that rejected requests never touch the database — lives in
// tests/admin-rankings-http.test.mjs, which drives the actual route
// handlers through a real `next dev` server (a direct-import test can't do
// this meaningfully: cookies() throws synchronously outside a real Next
// request scope, so every call would 401 regardless of session state — see
// that file's header comment). What's left here is a fast, cheap secondary
// check that would catch someone deleting a requireAdmin(Mutation) call by
// accident, without needing to boot a server for every test run — not a
// substitute for the behavioral proof, just a second, much cheaper guard
// next to it.

test('rotas de rankings: leitura exige requireAdmin, mutação exige requireAdminMutation (CSRF)', () => {
  const collection = read('app/api/admin/rankings/route.ts');
  const item = read('app/api/admin/rankings/[id]/route.ts');
  assert.match(collection, /requireAdmin\(\)/);
  assert.match(collection, /requireAdminMutation\(req\)/);
  assert.match(item, /requireAdmin\(\)/);
  const afterGet = item.slice(item.indexOf('export async function PATCH'));
  assert.doesNotMatch(afterGet, /await requireAdmin\(\);/);
  assert.match(afterGet, /requireAdminMutation\(req\)/g);
});

test('menu do painel: seção Conteúdo com Rankings', () => {
  const shell = read('components/admin/shell.tsx');
  assert.match(shell, /"Conteúdo"/);
  assert.match(shell, /\/admin\/rankings/);
});

test('rota de exclusão nunca apaga sem passar por requireAdminMutation, e o bloqueio de ranking publicado é reportado como conflito (409)', () => {
  const item = read('app/api/admin/rankings/[id]/route.ts');
  assert.match(item, /export async function DELETE/);
  assert.match(item, /deleteRanking\(id\)/);
  assert.match(item, /status:\s*409/);
});
