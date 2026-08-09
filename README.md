# Guia do Fone

## Rodar localmente

Instale Node.js 20+ e execute `npm install`, depois `npm run dev`. Para validar: `npm run typecheck`, `npm test` e `npm run build`.

## Catálogo SQLite

`lib/products.ts` é usado apenas para o seed inicial. A fonte pública definitiva é o SQLite: produtos ativos são lidos por `lib/public-products.ts` em home, ranking, páginas individuais e sitemap. Execute `npm run db:migrate` antes de iniciar em um ambiente novo; o seed idempotente é aplicado na primeira abertura de um banco sem produtos e não sobrescreve edições administrativas.

## Atualização de conteúdo

- Produtos, posições, especificações e links ficam em `lib/products.ts`.
- Substitua somente `affiliateUrl` pelos links oficiais aprovados; não invente IDs de afiliado.
- Defina `NEXT_PUBLIC_SITE_URL` para o domínio canônico antes do deploy.
- Adicione imagens licenciadas/autorizações em vez dos placeholders atuais; registre a origem e licença em cada item.
- Textos para divulgação ficam em `lib/share.ts`.
- A camada de eventos usa `console.info` como ponto neutro; conecte seu analytics por variável de ambiente sem enviar dados pessoais.
- O formulário de newsletter não envia dados até integrar um provedor e uma política LGPD adequada.

Os documentos institucionais são rascunhos operacionais e exigem revisão jurídica antes da publicação.

## Docker com SQLite persistente

O container usa o volume nomeado `guia-do-fone-data`, montado em `/app/data`. O SQLite fica em `/app/data/guia-do-fone.sqlite` e não integra a imagem descartável. Crie `.env.local` a partir de `.env.example`, preenchendo somente dados reais, e execute `docker compose up --build -d`. Por padrão ele atende em `http://localhost:3002`; defina `HOST_PORT` para alterar apenas a porta do host.

Para acompanhar o estado, use `docker compose ps` e `docker compose logs -f`. Reiniciar ou recriar o container sem o comando `docker compose down -v` preserva o volume. Faça backup do volume antes de atualizações: esta versão ainda não inclui backup/restauração pela aplicação.

## SEO e publicação

1. Copie `.env.example` para `.env.local` e informe o domínio canônico real em `NEXT_PUBLIC_SITE_URL` antes do deploy.
2. Publique no domínio definitivo, cadastre a propriedade no Google Search Console e inclua o token real em `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` se usar verificação por meta tag.
3. Envie `https://seu-dominio/sitemap.xml`, inspecione a URL do ranking e solicite indexação somente depois de conferir HTML e canonical.
4. Valide o JSON-LD no Rich Results Test e acompanhe Cobertura/Indexação, Core Web Vitals, impressões, posição média, CTR e páginas indexadas.

## Plano editorial de 90 dias

- Mês 1: verificar fontes oficiais e imagens licenciadas dos dez produtos; publicar fichas individuais apenas quando houver conteúdo original suficiente.
- Mês 2: publicar guias completos sobre TWS versus headphone, ANC versus ENC e como escolher fone Bluetooth, com links contextuais para o ranking.
- Mês 3: produzir comparativos realmente pesquisados, como P30i versus Wave Buds 2, e guias de academia, trabalho e fones baratos. Só inclua conteúdo completo e útil no sitemap.
