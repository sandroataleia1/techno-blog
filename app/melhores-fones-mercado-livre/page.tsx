import type {Metadata} from "next";
import {Catalog, Disclosure, Footer, Header, Newsletter, Share, TopThree} from "@/components";
import {site} from "@/lib/site";
import {publicProducts} from "@/lib/public-products";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "10 melhores fones de ouvido do Mercado Livre em 2026",
  description: "Compare fones Bluetooth por uso, ANC, marca e categoria.",
  alternates:{canonical: "/melhores-fones-mercado-livre"},
};

export default function Article() {
  const products = publicProducts();
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {"@type": "Article", headline: "Os 10 melhores fones de ouvido do Mercado Livre em 2026", mainEntityOfPage: `${site.url}/melhores-fones-mercado-livre`},
      {"@type": "ItemList", numberOfItems: products.length, itemListElement: products.map((p) => ({"@type": "ListItem", position: p.position, name: p.name, url: `${site.url}/fones/${p.slug}`}))},
    ],
  }).replace(/</g, "\\u003c");

  return (
    <>
      <Header />
      <main id="conteudo" className="article">
        <div className="shell">
          <p className="breadcrumbs">Início / Comparativos / Melhores fones</p>
          <h1>Os melhores fones de ouvido do Mercado Livre em 2026</h1>
          <p className="lead">Ranking editorial atualizado a partir dos produtos ativos no catálogo. Preços e disponibilidade podem mudar.</p>
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
            <TopThree products={products.slice(0, 3)} />
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
            <Catalog products={products} />
          </div>
        </section>

        <section>
          <div className="shell">
            <h2>Como escolher</h2>
            <p>Compare conforto, formato, recursos e compatibilidade. Confirme as especificações e a versão no anúncio antes de comprar.</p>
          </div>
        </section>

        <Newsletter />
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: jsonLd}} />
    </>
  );
}
