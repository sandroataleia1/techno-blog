# Techno Blog

Projeto anteriormente publicado como "Guia do Fone". O escopo editorial foi ampliado de fones de ouvido para tecnologia em geral (rankings, comparativos, fichas técnicas, tendências e guias de compra de diversas categorias), mantendo o ranking de fones já publicado como parte do conteúdo do Techno Blog. A identidade (nome, slogan, descrição, redes, contato, OG) fica centralizada em `lib/site.ts` — troque a marca inteira editando só esse arquivo.

**Nota sobre nomes técnicos**: o arquivo do banco (`data/guia-do-fone.sqlite`), o volume Docker (`guia-do-fone-data`) e o prefixo dos backups continuam com o nome antigo de propósito — são identificadores de infraestrutura já em uso; renomeá-los exigiria migrar manualmente o volume/arquivo em produção e não traz benefício real, então foram mantidos estáveis no rebranding.

## Rodar localmente

Instale Node.js 20+ e execute `npm install`, depois `npm run dev`. Para validar: `npm run typecheck`, `npm test` e `npm run build`.

## Banco de dados (SQLite)

`lib/products.ts` é usado apenas para o seed inicial dos 10 produtos originais. A fonte pública definitiva é o SQLite: produtos ativos são lidos por `lib/public-products.ts` em home, ranking, páginas individuais e sitemap. As migrations rodam automaticamente (de forma transacional e idempotente) na primeira vez que a aplicação abre o banco — `npm run db:migrate` só garante que a tabela de controle de migrations exista antes disso.

O schema inclui hoje, além de `products`/`product_images` (modelo original de fones): `brands`, `categories`, `media_assets`, `specification_definitions`, `product_specifications`, `manufacturer_sources`, `rankings`/`ranking_items`, `comparisons`/`comparison_items`, `trends`, `hero_banners` e `affiliate_offers` — a base relacional para o Techno Blog multi-categoria. Nenhuma coluna ou tabela do modelo original foi removida; os dados dos 10 produtos existentes foram preservados e replicados para as novas tabelas (marca, categoria "Fones de ouvido", especificações, ranking e ofertas de afiliado), sem perda de informação. Painel administrativo, upload de imagem e fluxo de backup/restore para essas novas entidades ainda serão construídos nas próximas fases.

## Atualização de conteúdo

- Produtos, posições, especificações e links originais ficam em `lib/products.ts` (seed) e no SQLite.
- Substitua somente `affiliateUrl`/`AffiliateOffer.affiliateUrl` pelos links oficiais aprovados; não invente IDs de afiliado.
- Defina `NEXT_PUBLIC_SITE_URL` para o domínio canônico antes do deploy.
- Imagens de produto usam ilustrações editoriais originais (sem foto de fabricante sem licença). Para novas entidades (marca, categoria, tendência, banner), registre origem e licença em `MediaAsset` antes de publicar.
- A camada de eventos usa `console.info` como ponto neutro; conecte seu analytics por variável de ambiente sem enviar dados pessoais.
- O formulário de newsletter não envia dados até integrar um provedor e uma política LGPD adequada.

Os documentos institucionais são rascunhos operacionais e exigem revisão jurídica antes da publicação.

## Variáveis de ambiente

Veja `.env.example` para a lista completa. Resumo:

- **Identidade pública**: `NEXT_PUBLIC_SITE_URL` (obrigatório antes do deploy), `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `NEXT_PUBLIC_AUTHOR_NAME`/`_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_SOCIAL_*`.
- **Admin**: ver "Credencial de admin" abaixo.
- **Links de afiliado**: `AFFILIATE_ALLOWED_HOSTS` (lista separada por vírgula; padrão cobre Mercado Livre).
- **Banco/backup**: `DATABASE_PATH`, `BACKUP_PATH`, `BACKUP_MAX_COUNT`, `BACKUP_MAX_BYTES`.

### Credencial de admin

`/admin` exige três variáveis: `ADMIN_EMAIL`, uma forma de `ADMIN_PASSWORD_HASH` (ver abaixo) e `ADMIN_SESSION_SECRET` (uma string aleatória longa, só usada para assinar o cookie de sessão — não precisa ser memorizável, gere com `openssl rand -hex 32` ou similar). **Se qualquer uma estiver ausente ou malformada, `/admin/login` responde de forma consistente com "Credenciais inválidas" — a aplicação nunca informa qual variável falhou, para não vazar detalhes de configuração, e nunca grava senha, hash ou o conteúdo dessas variáveis em log.**

**Gerar o hash:**

```
node scripts/create-admin-hash.mjs "sua senha com pelo menos 12 caracteres"
```

O script imprime duas formas do mesmo hash e explica onde usar cada uma:

1. **`ADMIN_PASSWORD_HASH=scrypt$<salt>$<hash>`** — a forma direta. Use **somente** como variável de ambiente de processo real: `environment:` do Docker Compose, `export` no shell, systemd `Environment=`, a UI de secrets da sua plataforma de deploy. **Nunca cole essa string em um arquivo `.env`, `.env.local`, `.env.production` etc.** — o carregador de ambiente do Next.js (`@next/env`) roda todo arquivo desse tipo através de uma expansão estilo shell que trata `$palavra` como referência a outra variável; como o hash é `scrypt$<hex>$<hex>`, o valor é silenciosamente truncado para a string literal `"scrypt"` e todo login passa a falhar sem nenhuma pista do motivo real. Isso vale para `.env`, `.env.local`, `.env.development[.local]` e `.env.production[.local]` — todos passam pelo mesmo carregador.
2. **`ADMIN_PASSWORD_HASH_BASE64=<base64 do valor acima>`** — segura para colar em `.env.local`. O alfabeto base64 (A–Z, a–z, 0–9, `+`, `/`, `=`) não contém `$`, então nada é expandido. O servidor decodifica no lado servidor apenas quando `ADMIN_PASSWORD_HASH` (a forma direta) não estiver presente ou não tiver o formato esperado.

**Rotação**: gere um novo hash com o script e substitua a variável (`ADMIN_PASSWORD_HASH` ou `_BASE64`, conforme onde ela vive) — não há estado adicional para limpar.

### Sessão sem estado no servidor (leia antes do deploy)

O cookie de sessão é um token assinado (HMAC), sem tabela de sessão no banco. Isso tem uma consequência que precisa ficar explícita:

- **Logout remove o cookie do navegador — ele não revoga o token no servidor.** Não existe lista de tokens válidos para riscar um deles.
- Uma cópia do token (vazada, capturada por XSS em algum outro ponto, salva antes do logout etc.) **continua válida normalmente até a expiração natural de 8h**, mesmo que o usuário já tenha clicado em "Sair".
- Trocar a senha (rotacionar `ADMIN_PASSWORD_HASH`) também não invalida tokens já emitidos — eles foram assinados com `ADMIN_SESSION_SECRET`, não derivados da senha.
- A única forma de invalidar todas as sessões emitidas hoje é **rotacionar `ADMIN_SESSION_SECRET`** — isso invalida a assinatura de qualquer token existente (inclusive o de quem acabou de logar, que precisará logar de novo).

Isso é uma limitação de arquitetura conhecida e aceita nesta fase (implementar um store de sessão server-side revogável é uma mudança maior, fora do escopo de "não redesenhar a autenticação além do necessário"). Está registrada aqui como **item obrigatório de endurecimento a avaliar antes de um deploy em produção real** — junto com HTTPS obrigatório (`Secure` no cookie já é automático quando `NODE_ENV=production`) e um plano de resposta para "preciso invalidar todas as sessões agora" (rotacionar `ADMIN_SESSION_SECRET`).

### Outras pendências obrigatórias antes do deploy

Registradas aqui, não implementadas nesta fase (mudariam a arquitetura de migrations/backup além do que foi pedido):

1. **Revogação de sessão no servidor** — ver seção acima.
2. **Proteção contra migrations rodando no banco errado.** Hoje `applyMigrations()` roda automaticamente na primeira chamada de `db()`, sem confirmar contra qual arquivo/ambiente ela está prestes a agir — um processo de desenvolvimento esquecido em segundo plano (com hot-reload do Next.js) já aplicou uma migração real deste projeto à base de produção mais cedo do que planejado, sem que ninguém pedisse (ver relatório da correção da MVP-1). Nenhum dado foi perdido nesse incidente, mas o cenário só não foi pior por sorte de a migração ser aditiva/segura — a próxima pode não ser. Antes do deploy, considerar: exigir uma variável explícita (`ALLOW_MIGRATIONS=true` ou similar) fora de ambiente de desenvolvimento, ou pelo menos logar (sem segredo) qual `DATABASE_PATH` está prestes a ser migrado antes de aplicar.
3. **Backup automático antes de migrations destrutivas.** `createBackup()` (`VACUUM INTO`) já existe e é usado sob demanda pelo painel — mas `applyMigrations()` não chama isso sozinho antes de rodar uma migração que remove coluna/tabela (como a 023, que remove `current_price`/`previous_price` depois de copiar os valores). Um backup automático imediatamente antes de qualquer migração marcada como potencialmente destrutiva reduziria o risco do item 2 a "reversível em segundos" em vez de "reversível manualmente a partir de um backup antigo".
4. **Confirmação explícita do caminho/ambiente do banco em operações administrativas.** O painel (`/admin`) e os scripts de migração não exibem hoje, em nenhum lugar visível ao operador, qual `DATABASE_PATH`/ambiente está em uso no momento — facilita exatamente o tipo de engano do item 2 (confundir qual banco uma ação vai afetar). Um indicador simples (ex.: rodapé do painel mostrando o caminho do arquivo ativo, ou um aviso quando `NODE_ENV!=="production"` mas o `DATABASE_PATH` aponta para fora de `data/`) fecharia essa lacuna sem mudar a arquitetura.

**Por ambiente:**

| Ambiente | Onde colocar |
|---|---|
| Dev local (`npm run dev`) | `ADMIN_PASSWORD_HASH_BASE64` em `.env.local` (mais simples) — ou `ADMIN_PASSWORD_HASH` exportado no shell antes de rodar `npm run dev`, se preferir a forma direta |
| Docker Compose (como configurado neste repo) | Funciona com `.env.local` + `ADMIN_PASSWORD_HASH_BASE64` (mesma razão do dev local: o Compose injeta o conteúdo do `env_file` como variável de processo real dentro do container, mas o `.dockerignore` já impede que qualquer `.env*` seja copiado para dentro da imagem — então, na prática, tanto faz; `_BASE64` é a opção uniforme mais simples de lembrar) |
| Produção (fora deste `docker-compose.yml`) | `ADMIN_PASSWORD_HASH` direto, injetado pela plataforma/secret manager como variável de processo real — nunca em um arquivo `.env*` que fique no disco do servidor em produção |

Se as duas variáveis estiverem definidas ao mesmo tempo, `ADMIN_PASSWORD_HASH` (a direta) tem prioridade.

## Docker com SQLite persistente

O container usa o volume nomeado `guia-do-fone-data`, montado em `/app/data`. O SQLite fica em `/app/data/guia-do-fone.sqlite` e não integra a imagem descartável (ver nota sobre nomes técnicos no topo). Crie `.env.local` a partir de `.env.example`, preenchendo somente dados reais, e execute `docker compose up --build -d`. Por padrão ele atende em `http://localhost:3002`; defina `HOST_PORT` para alterar apenas a porta do host.

Para acompanhar o estado, use `docker compose ps` e `docker compose logs -f`. Reiniciar ou recriar o container sem o comando `docker compose down -v` preserva o volume. Use `/admin/backup` (ou `POST /api/admin/backups`) para gerar um backup completo do banco (`VACUUM INTO`) antes de atualizações importantes.

## SEO e publicação

1. Copie `.env.example` para `.env.local` e informe o domínio canônico real em `NEXT_PUBLIC_SITE_URL` antes do deploy.
2. Publique no domínio definitivo, cadastre a propriedade no Google Search Console e inclua o token real em `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` se usar verificação por meta tag.
3. Envie `https://seu-dominio/sitemap.xml`, inspecione a URL do ranking e solicite indexação somente depois de conferir HTML e canonical.
4. Valide o JSON-LD no Rich Results Test e acompanhe Cobertura/Indexação, Core Web Vitals, impressões, posição média, CTR e páginas indexadas.
5. A URL `/melhores-fones-mercado-livre` é preservada intencionalmente durante a expansão para tecnologia — qualquer rota que precisar mudar de endereço no futuro ganha redirecionamento permanente (301) e canonical correta, nunca as duas URLs convivendo sem redirect.

## Roteiro de expansão (Guia do Fone → Techno Blog)

1. **Identidade e schema** (concluído): marca centralizada em `lib/site.ts`; novas entidades relacionais criadas de forma aditiva, sem remover nada do modelo original.
2. **Painel administrativo**: seções de marcas, categorias, especificações, fontes/revisões pendentes, rankings, comparativos, tendências, banners, mídia e ofertas de afiliado.
3. **Coleta assistida de dados do fabricante**: administrador informa URL oficial → coleta segura e validada → proposta revisável → publicação só após aprovação humana.
4. **Novas rotas públicas**: `/tendencias`, `/categorias/[slug]`, `/produtos/[slug]`, `/rankings/[slug]`, `/comparativos/[slug]`, `/marcas/[slug]`, `/guias/[slug]`.
5. **Home multi-categoria**: carrossel de banners, tendências, rankings, comparativos, categorias e guias recentes.
6. **SEO final**: dados estruturados de Organization/WebSite, breadcrumbs e sitemap totalmente orientado a dados.

## Plano editorial de 90 dias

- Mês 1: verificar fontes oficiais e imagens licenciadas dos dez produtos de fones já publicados; publicar fichas individuais apenas quando houver conteúdo original suficiente.
- Mês 2: publicar guias completos sobre TWS versus headphone, ANC versus ENC e como escolher fone Bluetooth, com links contextuais para o ranking, e iniciar a curadoria da primeira categoria adicional do Techno Blog.
- Mês 3: produzir comparativos realmente pesquisados, como P30i versus Wave Buds 2, e guias de academia, trabalho e fones baratos. Só inclua conteúdo completo e útil no sitemap.
