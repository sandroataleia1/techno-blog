import type {Metadata} from "next";
import {notFound} from "next/navigation";
import Link from "next/link";
import {Footer, Header, Offer, ProductMedia, QuickFacts} from "@/components";
import {IconBattery, IconCheck, IconDrop, IconFlag, IconLink, IconShield, IconType, IconWave} from "@/components/icons";
import {productBySlug} from "@/lib/db";
import {publicProducts, type PublicProduct} from "@/lib/public-products";

const USE_LABELS: Record<string, string> = {academia: "Academia", trabalho: "Trabalho", viagem: "Viagem", cotidiano: "Cotidiano"};

function buildFaq(p: PublicProduct) {
  return [
    {q: `O ${p.name} é TWS ou headphone?`, a: `Segundo a ficha do produto, o ${p.name} é do tipo ${p.type}.`},
    {q: `O ${p.name} tem cancelamento de ruído (ANC)?`, a: p.anc === "Sim" ? "Sim, o ANC está confirmado nas especificações deste modelo." : `As especificações confirmadas indicam “${p.anc}” para ANC neste modelo.`},
    {q: "Qual é a autonomia de bateria informada?", a: p.battery === "Não informado" ? "A autonomia ainda não está confirmada oficialmente para este modelo." : `A bateria informada é ${p.battery}.`},
    {q: `Para quais usos o ${p.name} é indicado?`, a: p.use.length ? `Indicado principalmente para ${p.use.map((u) => USE_LABELS[u] || u).join(", ")}.` : "Uso recomendado ainda não classificado."},
  ];
}

export const dynamic = "force-dynamic";

export async function generateMetadata({params}: {params: Promise<{slug: string}>}): Promise<Metadata> {
  const p = productBySlug((await params).slug);
  return p ? {title: p.name, description: p.short_description, alternates: {canonical: `/fones/${p.slug}`}} : {};
}

export default async function ProductPage({params}: {params: Promise<{slug: string}>}) {
  const row = productBySlug((await params).slug);
  if (!row) notFound();
  const products = publicProducts();
  const p = products.find((x) => x.id === row.id);
  if (!p) notFound();
  const alternatives = products
    .filter((x) => x.id !== p.id)
    .sort((a, b) => Number(a.type !== p.type) - Number(b.type !== p.type) || a.position - b.position)
    .slice(0, 3);
  const faq = buildFaq(p);

  return (
    <>
      <Header />
      <main id="conteudo" className="article">
        <div className="shell product-hero">
          <p className="breadcrumbs">Início / Fones / {p.name}</p>
          <div className="product-kicker"><p className="eyebrow">{p.category}</p></div>
          <h1>{p.name}: vale a pena para o seu uso?</h1>
          <p className="product-verdict">{row.full_description}</p>

          <div className="product-top">
            <div className="product-media-wrap">
              <ProductMedia p={p} priority />
            </div>
            <div className="product-side">
              <p className="rank-tag">{p.badge}</p>
              <QuickFacts p={p} />
              <div className="actions">
                <Offer p={p} />
              </div>
              <p className="small">Atualizado em {new Date(p.updatedAt).toLocaleDateString("pt-BR")}.</p>
            </div>
          </div>
        </div>

        <section className="product-section">
          <div className="shell">
            <h2>Por que ele se destaca</h2>
            <ul className="why-list">
              {p.benefits.map((b) => <li key={b}><IconCheck /> {b}</li>)}
            </ul>
          </div>
        </section>

        <section className="product-section">
          <div className="shell">
            <h2>Onde ele perde pontos</h2>
            <ul className="watch-list">
              {p.limitations.map((l) => <li key={l}><IconFlag /> {l}</li>)}
            </ul>
          </div>
        </section>

        <section className="product-section">
          <div className="shell">
            <h2>Ficha rápida</h2>
            <div className="spec-table">
              <div><IconType /> Tipo <b>{p.type}</b></div>
              <div><IconBattery /> Bateria <b>{p.battery}</b></div>
              <div><IconShield /> ANC <b>{p.anc}</b></div>
              <div><IconWave /> Codec <b>{p.codec}</b></div>
              <div><IconDrop /> Resistência <b>{p.resistance}</b></div>
              <div><IconLink /> Multiponto <b>{p.multipoint}</b></div>
            </div>
          </div>
        </section>

        <section className="product-section">
          <div className="shell">
            <h2>Para quem faz sentido</h2>
            <ul className="fit-tags">
              {p.use.map((u) => <li key={u}>{USE_LABELS[u] || u}</li>)}
            </ul>
          </div>
        </section>

        {alternatives.length > 0 && (
          <section className="product-section">
            <div className="shell">
              <h2>Alternativas</h2>
              <div className="alt-grid">
                {alternatives.map((a) => (
                  <Link key={a.id} className="alt-card" href={`/fones/${a.slug}`}>
                    <ProductMedia p={a} />
                    <p className="rank-tag">{a.badge}</p>
                    <h3>{a.name}</h3>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="product-section">
          <div className="shell">
            <h2>Perguntas frequentes</h2>
            <div className="faq">
              {faq.map((item) => (
                <details key={item.q} className="faq-item">
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
