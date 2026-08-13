import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  assignPositions,
  HOMEPAGE_BLOCK_CONTENT_MODES,
  HOMEPAGE_BLOCK_STATUSES,
  HomepageBlockValidationError,
  isValidColumns,
  isValidLinkUrl,
  MAX_BLOCK_ITEMS,
  MAX_COLUMNS,
  MIN_COLUMNS,
  validateDraftItems,
  validateItemsForPublish,
} from '../lib/homepage-blocks-rules.ts';
import {translateHomepageBlockError, validateHomepageBlockBody} from '../app/api/admin/homepage-blocks/route.ts';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function item(overrides = {}) {
  return {linkUrl: '/melhores-fones-mercado-livre', text: 'Texto', imageId: 'img-1', ...overrides};
}

// ---------- Behavioral: pure rules (real logic) ----------

test('colunas: aceita inteiros de 1 a 6, rejeita fora da faixa e não-inteiros', () => {
  assert.equal(isValidColumns(MIN_COLUMNS), true);
  assert.equal(isValidColumns(MAX_COLUMNS), true);
  assert.equal(isValidColumns(3), true);
  assert.equal(isValidColumns(0), false);
  assert.equal(isValidColumns(7), false);
  assert.equal(isValidColumns(2.5), false);
  assert.equal(isValidColumns(NaN), false);
});

test('link: aceita caminho interno (/algo) e URL https, rejeita http/javascript/malformado', () => {
  assert.equal(isValidLinkUrl('/melhores-fones-mercado-livre'), true);
  assert.equal(isValidLinkUrl('https://mercadolivre.com.br/produto'), true);
  assert.equal(isValidLinkUrl('http://inseguro.com'), false);
  assert.equal(isValidLinkUrl('javascript:alert(1)'), false);
  assert.equal(isValidLinkUrl('nem uma url'), false);
});

test('posição: assignPositions nunca confia em posição vinda do cliente — sempre deriva do índice do array', () => {
  const items = [item({linkUrl: '/a'}), item({linkUrl: '/b'}), item({linkUrl: '/c'})];
  const positioned = assignPositions(items);
  assert.deepEqual(positioned.map((i) => i.position), [1, 2, 3]);
});

test('rascunho: aceita até MAX_BLOCK_ITEMS itens, rejeita mais', () => {
  assert.equal(validateDraftItems([]), null);
  assert.equal(validateDraftItems(Array.from({length: MAX_BLOCK_ITEMS}, () => item())), null);
  assert.match(validateDraftItems(Array.from({length: MAX_BLOCK_ITEMS + 1}, () => item())), /no máximo/);
});

test('publicação: exige pelo menos 1 item', () => {
  assert.match(validateItemsForPublish('both', []), /pelo menos um item/);
});

test('publicação: todo item exige link, independente do modo', () => {
  const err = validateItemsForPublish('text', [item({linkUrl: '', text: 'x'})]);
  assert.match(err, /link/);
});

test('publicação: modo "photo" exige imagem em cada item, não exige texto', () => {
  assert.match(validateItemsForPublish('photo', [item({imageId: null})]), /imagem/);
  assert.equal(validateItemsForPublish('photo', [item({imageId: 'img-1', text: ''})]), null);
});

test('publicação: modo "text" exige texto em cada item, não exige imagem', () => {
  assert.match(validateItemsForPublish('text', [item({text: ''})]), /texto/);
  assert.equal(validateItemsForPublish('text', [item({text: 'algo', imageId: null})]), null);
});

test('publicação: modo "both" exige imagem e texto em cada item', () => {
  assert.match(validateItemsForPublish('both', [item({imageId: null})]), /imagem/);
  assert.match(validateItemsForPublish('both', [item({text: ''})]), /texto/);
  assert.equal(validateItemsForPublish('both', [item()]), null);
});

test('estados e modos de conteúdo aceitos', () => {
  assert.deepEqual([...HOMEPAGE_BLOCK_STATUSES], ['draft', 'published', 'archived']);
  assert.deepEqual([...HOMEPAGE_BLOCK_CONTENT_MODES], ['photo', 'text', 'both']);
});

// ---------- Behavioral: centralized body validation / error translation ----------

test('validateHomepageBlockBody: corpo nulo, array, string ou número é rejeitado como "Corpo da requisição inválido.", nunca um TypeError bruto', () => {
  for (const badBody of [null, [], ['x'], 'a string', 42, true]) {
    assert.throws(() => validateHomepageBlockBody(badBody), (err) => {
      assert.ok(err instanceof HomepageBlockValidationError, 'deve lançar HomepageBlockValidationError, não um TypeError de acesso a propriedade');
      assert.equal(err.message, 'Corpo da requisição inválido.');
      return true;
    });
  }
});

test('validateHomepageBlockBody: título, contentMode e status são obrigatórios/validados', () => {
  assert.throws(() => validateHomepageBlockBody({contentMode: 'both', status: 'draft', items: []}), /Título/);
  assert.throws(() => validateHomepageBlockBody({title: 'x', contentMode: 'invalido', status: 'draft', items: []}), /Modo de conteúdo/);
  assert.throws(() => validateHomepageBlockBody({title: 'x', contentMode: 'both', status: 'invalido', items: []}), /Status inválido/);
});

test('translateHomepageBlockError: marcadores de autenticação nunca vazam como texto — 401/403 sempre com mensagem pública fixa', () => {
  assert.deepEqual(translateHomepageBlockError(new Error('UNAUTHORIZED')), {status: 401, message: 'Não autorizado'});
  assert.deepEqual(translateHomepageBlockError(new Error('FORBIDDEN')), {status: 403, message: 'Requisição proibida'});
});

test('translateHomepageBlockError: erro de integridade do SQLite (UNIQUE/FOREIGN KEY) é traduzido, nunca aparece SQL/SQLite na resposta', () => {
  const unique = translateHomepageBlockError(new Error('UNIQUE constraint failed: homepage_block_items.block_id, homepage_block_items.position'));
  assert.equal(unique.status, 409);
  assert.doesNotMatch(unique.message, /UNIQUE|SQL|SQLite/i);

  const fk = translateHomepageBlockError(new Error('FOREIGN KEY constraint failed'));
  assert.equal(fk.status, 409);
  assert.doesNotMatch(fk.message, /FOREIGN KEY|SQL|SQLite/i);
});

test('translateHomepageBlockError: JSON malformado (SyntaxError) vira 400 "Corpo da requisição inválido."', () => {
  let syntaxError;
  try {
    JSON.parse('{isso não é json');
  } catch (e) {
    syntaxError = e;
  }
  assert.ok(syntaxError instanceof SyntaxError);
  assert.deepEqual(translateHomepageBlockError(syntaxError), {status: 400, message: 'Corpo da requisição inválido.'});
});

test('translateHomepageBlockError: qualquer erro inesperado vira 500 genérico — nunca expõe a mensagem original', () => {
  const cases = [new TypeError("Cannot read properties of null (reading 'title')"), new Error('database is locked'), 'uma string lançada diretamente', undefined];
  for (const unexpected of cases) {
    const result = translateHomepageBlockError(unexpected);
    assert.deepEqual(result, {status: 500, message: 'Não foi possível concluir a operação.'});
  }
});

// ---------- Auxiliary structural checks ----------

test('rotas de blocos da home: leitura exige requireAdmin, mutação exige requireAdminMutation (CSRF)', () => {
  const collection = read('app/api/admin/homepage-blocks/route.ts');
  const item = read('app/api/admin/homepage-blocks/[id]/route.ts');
  assert.match(collection, /requireAdmin\(\)/);
  assert.match(collection, /requireAdminMutation\(req\)/);
  assert.match(item, /requireAdmin\(\)/);
  const afterGet = item.slice(item.indexOf('export async function PATCH'));
  assert.doesNotMatch(afterGet, /await requireAdmin\(\);/);
  assert.match(afterGet, /requireAdminMutation\(req\)/g);
});

test('rota de upload de mídia exige requireAdminMutation', () => {
  const upload = read('app/api/admin/media/route.ts');
  assert.match(upload, /requireAdminMutation\(req\)/);
});

test('menu do painel: seção Conteúdo com Blocos da home', () => {
  const shell = read('components/admin/shell.tsx');
  assert.match(shell, /"Conteúdo"/);
  assert.match(shell, /\/admin\/blocos/);
});

test('rota de exclusão nunca apaga sem passar por requireAdminMutation, e o bloqueio de bloco já publicado é reportado como conflito (409)', () => {
  const item = read('app/api/admin/homepage-blocks/[id]/route.ts');
  assert.match(item, /export async function DELETE/);
  assert.match(item, /deleteHomepageBlock\(id\)/);
  assert.match(item, /status:\s*409/);
});
