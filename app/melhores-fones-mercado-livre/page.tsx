import {cache} from "react";
import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {Catalog, Disclosure, Footer, Header, Newsletter, Share, TopThree} from "@/components";
import {site} from "@/lib/site";
import {publicRankingBySlug} from "@/lib/public-rankings";

const RANKING_SLUG = "melhores-fones-mercado-livre";

// Shared between generateMetadata and the page body so the ranking (and its
// 10 items + offers) is only ever read from the database once per request,
// not twice.
const getRanking = cache(() => publicRankingBySlug(RANKING_SLUG));

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const result = getRanking();
  if (result.kind === "ok") {
    return {
      title: result.ranking.title,
      description: result.ranking.description,
      alternates: {canonical: `/${RANKING_SLUG}`},
    };
  }
  if (result.kind === "archived") {
    return {
      title: `${result.ranking.title} (arquivado)`,
      alternates: {canonical: `/${RANKING_SLUG}`},
      robots: {index: false, follow: true},
    };
  }
  // not_found / invalid: no useful metadata to give — the page body decides
  // the actual response (notFound() or the generic error boundary).
  return {};
}

export default function Article() {
  const result = getRanking();

  if (result.kind === "not_found") notFound();

  // Published but violating one of its own invariants (see
  // lib/public-rankings.ts): never render a partial Top 10. Throwing here
  // (with a message that never includes any DB detail) is caught by this
  // route segment's error.tsx, which also forces a generic 500-class
  // response instead of a normal 200 page.
  if (result.kind === "invalid") {
    throw new Error("Não foi possível carregar este ranking no momento.");
  }

  if (result.kind === "archived") {
    return (
      <>
        <Header />
        <main id="conteudo" className="article">
          <div className="shell tombstone">
            <p className="eyebrow">Ranking arquivado</p>
            <h1>{result.ranking.title}</h1>
            <p className="lead">Este ranking foi publicado anteriormente e está arquivado no momento — não reflete mais nossa recomendação atual e não traz produtos, ofertas ou comparador.</p>
            <p className="small">Publicado em {new Date(result.ranking.publishedAt).toLocaleDateString("pt-BR")}.</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const {ranking, items} = result;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: ranking.title,
        description: ranking.description,
        datePublished: ranking.publishedAt,
        dateModified: ranking.updatedAt,
        mainEntityOfPage: `${site.url}/${RANKING_SLUG}`,
      },
      {
        "@type": "ItemList",
        numberOfItems: items.length,
        itemListElement: items.map((p) => ({"@type": "ListItem", position: p.position, name: p.name, url: `${site.url}/fones/${p.slug}`})),
      },
    ],
  }).replace(/</g, "\\u003c");

  return (
    <>
      <Header />
      <main id="conteudo" className="article">
        <div className="shell">
          <p className="breadcrumbs">Início / Comparativos / Melhores fones</p>
          <h1>{ranking.title}</h1>
          <p className="lead">{ranking.description}</p>
          <Disclosure />
          <nav className="toc"><a href="#ranking">Ranking e filtros</a> · <a href="#comparador">Comparador</a></nav>
          <Share />
        </div>

        <section>
          <div className="shell">
            <div className="section-head">
              <div>
                <p className="eyebrow">Top 3</p>
                <h2>O pódio deste comparativo</h2>
              </div>
            </div>
            <TopThree products={items.slice(0, 3)} />
          </div>
        </section>

        <section id="ranking">
          <div className="shell">
            <div className="section-head">
              <div>
                <p className="eyebrow">Ranking completo</p>
                <h2>Filtre, compare e escolha</h2>
              </div>
            </div>
            <Catalog products={items} />
          </div>
        </section>

        <section>
          <div className="shell">
            <h2>Como escolher</h2>
            <p>{ranking.methodology}</p>
          </div>
        </section>

        <Newsletter />
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: jsonLd}} />
    </>
  );
}
