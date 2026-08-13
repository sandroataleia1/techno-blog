"use client";
import Image from "next/image";
import Link from "next/link";
import {useMemo, useState} from "react";
import {externalProps, site} from "@/lib/site";
import type {PublicProduct} from "@/lib/public-products";
import {formatCentsToBRL, shouldShowPreviousPrice} from "@/lib/offers-rules";
import {LogoMark, Wordmark, WaveMotif} from "@/components/brand";
import {
  IconArrowRight,
  IconBattery,
  IconChevronLeft,
  IconChevronRight,
  IconDrop,
  IconFlag,
  IconImage,
  IconLink,
  IconShield,
  IconTag,
  IconType,
  IconWave,
} from "@/components/icons";

// ---------- Header / Footer ----------

export function Header() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <header className="header">
      <div className="shell nav">
        <Link className="brand" href="/" onClick={close}>
          <LogoMark />
          <Wordmark />
        </Link>
        <nav className={`nav-links${open ? " is-open" : ""}`} aria-label="Principal" id="site-menu">
          <Link href="/melhores-fones-mercado-livre" onClick={close}>Ranking</Link>
          <Link href="/melhores-fones-mercado-livre#comparador" onClick={close}>Comparador</Link>
          <Link href="/sobre" onClick={close}>Sobre</Link>
        </nav>
        <div className="nav-actions">
          <Link className="cta nav-cta" href="/melhores-fones-mercado-livre">Ver ranking</Link>
          <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen((o) => !o)}>
            <span /><span /><span />
            <span className="sr-only">{open ? "Fechar menu" : "Abrir menu"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <WaveMotif className="footer-wave" />
      <div className="shell footer-inner">
        <div className="footer-top">
          <Link className="brand brand--footer" href="/">
            <LogoMark tone="on-dark" size={30} />
            <Wordmark />
          </Link>
          <p className="footer-tagline">Escolha pelo seu uso, não pelo marketing.</p>
        </div>
        <nav className="footer-grid" aria-label="Institucional">
          <div className="footer-col">
            <p className="footer-heading">{site.name}</p>
            <Link href="/melhores-fones-mercado-livre">Ranking e comparativos</Link>
            <Link href="/sobre">Sobre</Link>
            {site.contact.email && <Link href="/contato">Contato</Link>}
            <Link href="/politica-editorial">Política editorial</Link>
            <Link href="/politica-de-correcoes">Política de correções</Link>
          </div>
          <div className="footer-col">
            <p className="footer-heading">Políticas</p>
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/cookies">Cookies</Link>
            <Link href="/termos">Termos</Link>
            <Link href="/divulgacao-afiliados">Divulgação de afiliados</Link>
          </div>
        </nav>
      </div>
      <div className="shell footer-legal">
        <p>{site.affiliateDisclosure}</p>
        <p>© 2026 {site.name}. Informações e posições editoriais podem ser atualizadas.</p>
      </div>
    </footer>
  );
}

export function Disclosure() {
  return (
    <aside className="notice" aria-label="Divulgação de afiliados">
      <strong>Transparência:</strong> {site.affiliateDisclosure} Preços, versões e disponibilidade podem mudar no Mercado Livre.
    </aside>
  );
}

// ---------- Buttons ----------

const checkedDate = new Intl.DateTimeFormat("pt-BR", {dateStyle: "short"});

// The affiliate link and its price, if any, come exclusively from
// affiliate_offers (MVP-1) via p.offer — never from the legacy
// products.affiliate_url. When there's no active primary offer, the
// product and its editorial content stay visible (the caller renders this
// in place of a link, not instead of the whole card) — no empty or made-up
// href is ever generated.
export function Offer({p, label = "Ver oferta no Mercado Livre"}: {p: PublicProduct; label?: string}) {
  const offer = p.offer;
  if (!offer) {
    return <p className="offer-unavailable">Oferta indisponível no momento</p>;
  }
  const showPrevious = shouldShowPreviousPrice(offer.currentPriceCents, offer.previousPriceCents);
  return (
    <div className="offer-block">
      {offer.currentPriceCents !== null && offer.lastCheckedAt && (
        <p className="offer-price">
          {showPrevious && <span className="offer-price-previous">{formatCentsToBRL(offer.previousPriceCents!)}</span>}
          <span className="offer-price-current">{formatCentsToBRL(offer.currentPriceCents)}</span>
          <span className="offer-price-date">Conferido em {checkedDate.format(new Date(offer.lastCheckedAt))}</span>
        </p>
      )}
      <a className="cta ml" href={offer.affiliateUrl} {...externalProps} aria-label={`${label}: ${p.name}`} onClick={() => console.info("click_affiliate", p.id)}>
        {label} ↗
      </a>
    </div>
  );
}

// ---------- Product media ----------

export function ProductMedia({p, priority = false, className}: {p: PublicProduct; priority?: boolean; className?: string}) {
  return (
    <div className={`media-frame${className ? ` ${className}` : ""}`}>
      {p.image ? (
        <Image src={p.image} alt={p.alt} width={640} height={640} priority={priority} sizes="(max-width: 760px) 100vw, 640px" />
      ) : (
        <div className="media-placeholder" role="img" aria-label={p.alt || `Imagem em atualização de ${p.name}`}>
          <IconImage width={40} height={40} />
          <span>Imagem em atualização</span>
        </div>
      )}
    </div>
  );
}

// ---------- Quick facts ----------

export function QuickFacts({p}: {p: PublicProduct}) {
  return (
    <ul className="quick-facts">
      <li><IconType /> {p.type}</li>
      <li><IconBattery /> {p.battery}</li>
      <li><IconShield /> ANC {p.anc}</li>
    </ul>
  );
}

// ---------- Home hero: product carousel ----------

// A curated full-slide graphic for specific positions — supplied by the
// site owner as a complete, ready-made banner (its own headline/badge
// already drawn into the image), not a raw product cutout. When a
// position has one, it replaces the generated icon+badge+name+facts
// treatment entirely for that slide (rendering both would duplicate the
// text). Add slide02.png/slide03.png the same way once they exist —
// nothing else in this component needs to change.
const HERO_SLIDE_IMAGES: Partial<Record<number, {src: string; width: number; height: number}>> = {
  1: {src: "/images/hero/slide01.png", width: 864, height: 350},
};

// Rotates through the real Top 3 of the featured ranking (not decorative
// stock slides) — arrows and dots are fully functional, not a static
// carousel shell with dead controls. Full-width: no side text column
// competing with the image, so the visual is the only thing in the hero
// (the institutional headline/CTA now live in their own section right
// below — see app/page.tsx). The nav buttons/dots are rendered as
// *siblings* of the shell-constrained wrapper (not nested inside it)
// specifically so they can be positioned against the full width of the
// hero section, like a real full-bleed carousel.
export function HeroCarousel({products}: {products: PublicProduct[]}) {
  const [index, setIndex] = useState(0);
  const slide = products[index];
  const slideImage = slide ? HERO_SLIDE_IMAGES[slide.position] : undefined;
  const prev = () => setIndex((i) => (i - 1 + products.length) % products.length);
  const next = () => setIndex((i) => (i + 1) % products.length);
  return (
    <>
      {slide && (
        <div className="shell hero-grid-full">
          {slideImage ? (
            <div className="hero-banner" style={{aspectRatio: `${slideImage.width} / ${slideImage.height}`}}>
              <Image src={slideImage.src} alt={`${slide.name} — ${slide.badge}`} fill sizes="100vw" priority className="hero-banner-image" />
              {/* The banner graphic has its own decorative prev/next arrows and
                  dots baked into the pixels; these patches hide them so only
                  the real, functional controls rendered below are visible. */}
              <span className="hero-banner-mask hero-banner-mask-left" aria-hidden="true" />
              <span className="hero-banner-mask hero-banner-mask-right" aria-hidden="true" />
              <span className="hero-banner-mask hero-banner-mask-dots" aria-hidden="true" />
            </div>
          ) : (
            <div className="hero-visual">
              <span className="hero-ghost" aria-hidden="true">{String(slide.position).padStart(2, "0")}</span>
              <div className="hero-figure">
                <span className="hero-badge">{slide.badge}</span>
                <ProductMedia p={slide} priority className="hero-media" />
                <p className="hero-name">{slide.name}</p>
                <ul className="hero-facts">
                  <li><IconType /> {slide.type}</li>
                  <li><IconBattery /> {slide.battery}</li>
                  <li><IconShield /> ANC {slide.anc}</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
      {products.length > 1 && (
        <>
          <button type="button" className="hero-nav hero-nav-prev" onClick={prev} aria-label="Fone anterior">
            <IconChevronLeft />
          </button>
          <button type="button" className="hero-nav hero-nav-next" onClick={next} aria-label="Próximo fone">
            <IconChevronRight />
          </button>
          <div className="hero-dots" role="tablist" aria-label="Selecionar fone em destaque">
            {products.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                className={`hero-dot${i === index ? " is-active" : ""}`}
                aria-selected={i === index}
                aria-label={`Ver ${p.name}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ---------- Trust bar ----------

// ---------- Ranking: rich card (Top 3 / curated picks) ----------

export function RankCard({p, rank = "pair"}: {p: PublicProduct; rank?: "lead" | "pair"}) {
  return (
    <article className={`rank-card rank-card--${rank}`}>
      <div className="rank-card-media">
        <span className="rank-num" aria-hidden="true">{String(p.position).padStart(2, "0")}</span>
        <ProductMedia p={p} priority={rank === "lead"} />
      </div>
      <div className="rank-card-body">
        <p className="rank-tag">{p.badge}</p>
        <h3><Link href={`/fones/${p.slug}`}>{p.name}</Link></h3>
        <p className="rank-benefit">{p.description}</p>
        <QuickFacts p={p} />
        {p.limitations[0] && (
          <p className="rank-caution"><IconFlag /> {p.limitations[0]}</p>
        )}
        <div className="actions">
          <Offer p={p} />
          <Link className="cta alt" href={`/fones/${p.slug}`}>Ver análise completa <IconArrowRight /></Link>
        </div>
      </div>
    </article>
  );
}

export function TopThree({products}: {products: PublicProduct[]}) {
  const [first, second, third] = products;
  if (!first) return null;
  return (
    <div className="top3">
      <RankCard p={first} rank="lead" />
      <div className="top3-pair">
        {second && <RankCard p={second} rank="pair" />}
        {third && <RankCard p={third} rank="pair" />}
      </div>
    </div>
  );
}

// ---------- Ranking: compact editorial row (full filterable list) ----------

type CompareState = {checked: boolean; disabled: boolean; onToggle: () => void};

function RankRow({p, compare}: {p: PublicProduct; compare?: CompareState}) {
  return (
    <article className="rank-row" id={p.slug}>
      <span className="rank-row-num" aria-hidden="true">{String(p.position).padStart(2, "0")}</span>
      <div className="rank-row-media"><ProductMedia p={p} /></div>
      <div className="rank-row-info">
        <p className="rank-tag">{p.badge}</p>
        <h3><Link href={`/fones/${p.slug}`}>{p.name}</Link></h3>
        <p className="rank-benefit">{p.description}</p>
      </div>
      <div className="rank-row-actions">
        {compare && (
          <label className={`compare-chip${compare.checked ? " is-active" : ""}`}>
            <input type="checkbox" checked={compare.checked} disabled={compare.disabled} onChange={compare.onToggle} />
            <span>{compare.checked ? "Comparando" : "Comparar"}</span>
          </label>
        )}
        <Offer p={p} />
        <Link className="cta alt" href={`/fones/${p.slug}`}>Análise <IconArrowRight /></Link>
      </div>
    </article>
  );
}

// ---------- Catalog: filters + list + comparator ----------

// `initialUse` seeds the "Uso" filter from a real query param
// (?uso=trabalho, etc. — see app/melhores-fones-mercado-livre/page.tsx and
// the home page's real, working use-case shortcuts) so a link promising
// "fones para trabalhar" actually lands on that filtered view, instead of
// just scrolling to the same unfiltered list every other link goes to.
export function Catalog({products, initialUse}: {products: PublicProduct[]; initialUse?: string}) {
  const [type, setType] = useState("todos");
  const [anc, setAnc] = useState("todos");
  const [use, setUse] = useState(initialUse ?? "todos");
  const [brand, setBrand] = useState("todos");
  const [selected, setSelected] = useState<string[]>([]);
  const filtered = useMemo(
    () => products.filter((p) => (type === "todos" || p.type === type) && (anc === "todos" || p.anc === anc) && (use === "todos" || p.use.includes(use)) && (brand === "todos" || p.brand === brand)),
    [products, type, anc, use, brand]
  );
  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 3 ? [...s, id] : s));
  }
  const selectedP = products.filter((p) => selected.includes(p.id));
  return (
    <>
      <div className="filters" aria-label="Filtros">
        <label>Tipo
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="todos">Todos</option>
            <option>TWS</option>
            <option>Headphone</option>
          </select>
        </label>
        <label>ANC
          <select value={anc} onChange={(e) => setAnc(e.target.value)}>
            <option value="todos">Todos</option>
            <option>Sim</option>
            <option>Não informado</option>
          </select>
        </label>
        <label>Uso
          <select value={use} onChange={(e) => setUse(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="academia">Academia</option>
            <option value="trabalho">Trabalho</option>
            <option value="viagem">Viagem</option>
            <option value="cotidiano">Cotidiano</option>
          </select>
        </label>
        <label>Marca
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="todos">Todas</option>
            {[...new Set(products.map((p) => p.brand))].map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <p className="result-count">{filtered.length} modelos</p>
      </div>
      <p className="small">Use filtros para comparar o perfil de cada modelo. Dados não confirmados aparecem como “Não informado”.</p>
      <div className="rank-list">
        {filtered.map((p) => (
          <RankRow key={p.id} p={p} compare={{checked: selected.includes(p.id), disabled: !selected.includes(p.id) && selected.length === 3, onToggle: () => toggle(p.id)}} />
        ))}
      </div>
      <Comparator items={selectedP} />
    </>
  );
}

// ---------- Comparator ("bancada de teste") ----------

function Comparator({items}: {items: PublicProduct[]}) {
  const rows: [string, keyof PublicProduct, typeof IconType][] = [
    ["Tipo", "type", IconType],
    ["Bateria", "battery", IconBattery],
    ["ANC", "anc", IconShield],
    ["Codec", "codec", IconWave],
    ["Resistência", "resistance", IconDrop],
    ["Multiponto", "multipoint", IconLink],
    ["Principal benefício", "mainBenefit", IconTag],
  ];
  return (
    <section id="comparador" className="bench">
      <div className="section-head">
        <p className="eyebrow">Bancada de teste</p>
        <h2>Comparador</h2>
      </div>
      {items.length === 0 ? (
        <p className="notice">Selecione até três produtos para comparar.</p>
      ) : (
        <div className="bench-frame">
          <table className="bench-table">
            <caption className="small">Comparação editorial de até três produtos</caption>
            <thead>
              <tr>
                <th>Característica</th>
                {items.map((p) => <th key={p.id}>{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, key, Icon]) => {
                const values = items.map((p) => String(p[key]));
                const differs = new Set(values).size > 1;
                return (
                  <tr key={label}>
                    <th><Icon /> {label}</th>
                    {items.map((p, i) => (
                      <td key={p.id} className={differs ? "bench-diff" : undefined}>{values[i]}</td>
                    ))}
                  </tr>
                );
              })}
              <tr>
                <th>Oferta</th>
                {items.map((p) => <td key={p.id}><Offer p={p} /></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------- Share ----------

// `url` is passed by the caller (a Server Component that already knows the
// canonical path) rather than read from `window.location.href` — reading
// `window` during render produces a different value on the server (where
// `window` doesn't exist) than on the client's very first render, which is
// a classic React hydration mismatch (confirmed via a real browser: the
// server rendered site.url while the client immediately rendered
// window.location.href, before hydration could reconcile them).
export function Share({url}: {url: string}) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (navigator.share) await navigator.share({title: typeof document === "undefined" ? site.name : document.title, url});
  };
  return (
    <div className="share">
      <button className="cta alt" type="button" onClick={share}>Compartilhar</button>
      <a className="cta alt" href={`https://wa.me/?text=${encodeURIComponent("Confira este comparativo: " + url)}`} {...externalProps}>WhatsApp</a>
      <a className="cta alt" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} {...externalProps}>Facebook</a>
      <a className="cta alt" href={`https://t.me/share/url?url=${encodeURIComponent(url)}`} {...externalProps}>Telegram</a>
      <button className="cta alt" type="button" onClick={() => {navigator.clipboard.writeText(url); setCopied(true);}}>{copied ? "Link copiado" : "Copiar link"}</button>
    </div>
  );
}
