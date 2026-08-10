import Link from "next/link";
import {Footer, Header, Disclosure, Newsletter, RankCard, CategoryBands, ProductMedia} from "@/components";
import {WaveMotif} from "@/components/brand";
import {IconArrowRight, IconBattery, IconShield, IconType} from "@/components/icons";
import {publicProducts} from "@/lib/public-products";

export const dynamic = "force-dynamic";

export default function Home() {
  const p = publicProducts();
  const top = p.find((x) => x.position === 1) || p[0];
  const picks = [p.find((x) => x.slug === "soundcore-p30i"), p.find((x) => x.slug === "qcy-melobuds-pro"), p.find((x) => x.slug === "sony-wh-1000xm5")].filter(Boolean) as typeof p;

  return (
    <>
      <Header />
      <main id="conteudo">
        <section className="hero">
          <WaveMotif className="hero-wave" />
          <div className="shell hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">Guia de compra 2026</p>
              <h1>O fone certo muda tudo o que você ouve.</h1>
              <p className="lead">Comparamos os modelos mais procurados para encontrar o melhor em som, conforto e custo-benefício.</p>
              <div className="actions hero-actions">
                <Link className="cta" href="/melhores-fones-mercado-livre">Ver o ranking</Link>
                <Link className="cta alt" href="/melhores-fones-mercado-livre#comparador">Comparar modelos <IconArrowRight /></Link>
              </div>
            </div>
            {top && (
              <div className="hero-visual">
                <span className="hero-ghost" aria-hidden="true">{String(top.position).padStart(2, "0")}</span>
                <div className="hero-figure">
                  <span className="hero-badge">{top.badge}</span>
                  <ProductMedia p={top} priority />
                  <p className="hero-name">{top.name}</p>
                  <ul className="hero-facts">
                    <li><IconType /> {top.type}</li>
                    <li><IconBattery /> {top.battery}</li>
                    <li><IconShield /> ANC {top.anc}</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="shell">
            <div className="section-head">
              <div>
                <p className="eyebrow">Ponto de partida</p>
                <h2>Três escolhas para começar</h2>
              </div>
              <Link className="cta alt" href="/melhores-fones-mercado-livre">Ver ranking completo <IconArrowRight /></Link>
            </div>
            <div className="picks-row">
              {picks.map((x) => x && <RankCard key={x.id} p={x} rank="pair" />)}
            </div>
          </div>
        </section>

        <section>
          <div className="shell">
            <div className="section-head">
              <div>
                <p className="eyebrow">Escolha pelo seu uso</p>
                <h2>Guias por categoria</h2>
              </div>
            </div>
            <CategoryBands />
          </div>
        </section>

        <section>
          <div className="shell">
            <p className="eyebrow">Como avaliamos</p>
            <h2>Critério antes de comissão</h2>
            <p className="lead">Priorizamos conforto, bateria, recursos que ajudam no dia a dia e a relação entre o que cada modelo entrega e seu segmento.</p>
            <Disclosure />
          </div>
        </section>

        <Newsletter />
      </main>
      <Footer />
    </>
  );
}
