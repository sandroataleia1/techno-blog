"use client";
import Link from "next/link";
import {useMemo, useState} from "react";
import {externalProps, site} from "@/lib/site";
import type {PublicProduct} from "@/lib/public-products";
import {formatCentsToBRL, shouldShowPreviousPrice} from "@/lib/offers-rules";
import {LogoMark, Wordmark, WaveMotif} from "@/components/brand";
import {
  IconArrowRight,
  IconBattery,
  IconBriefcase,
  IconDiamond,
  IconDrop,
  IconDumbbell,
  IconFlag,
  IconImage,
  IconLink,
  IconPlane,
  IconSearch,
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
          <Link href="/melhores-fones-mercado-livre#comparador" onClick={close}>Comparativos</Link>
          <Link href="/#guias" onClick={close}>Guias</Link>
          <Link href="/sobre" onClick={close}>Sobre</Link>
          <label className="nav-search">
            <IconSearch />
            <input className="search" aria-label={`Buscar no ${site.name}`} placeholder="Buscar guias" />
          </label>
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
            <Link href="/contato">Contato</Link>
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
        <img src={p.image} alt={p.alt} width={640} height={640} loading={priority ? "eager" : "lazy"} decoding="async" />
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

export function Catalog({products}: {products: PublicProduct[]}) {
  const [type, setType] = useState("todos");
  const [anc, setAnc] = useState("todos");
  const [use, setUse] = useState("todos");
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

// ---------- Category bands ----------

const CATEGORIES = [
  {key: "academia", name: "Para academia", copy: "Leve, firme no ouvido e resistente ao suor.", Icon: IconDumbbell},
  {key: "trabalho", name: "Para trabalhar", copy: "Conforto prolongado e chamadas mais claras.", Icon: IconBriefcase},
  {key: "viagem", name: "Para viajar", copy: "Bateria longa e isolamento para trajetos.", Icon: IconPlane},
  {key: "barato", name: "Melhor barato", copy: "Bom custo-benefício sem abrir mão do essencial.", Icon: IconTag},
  {key: "anc", name: "Melhor ANC", copy: "Cancelamento de ruído mais consistente da lista.", Icon: IconShield},
  {key: "premium", name: "Melhor premium", copy: "Acabamento e recursos de ponta para quem investe mais.", Icon: IconDiamond},
] as const;

export function CategoryBands() {
  return (
    <div className="category-bands" id="guias">
      {CATEGORIES.map((c) => (
        <Link key={c.key} className="category-band" href="/melhores-fones-mercado-livre#ranking">
          <c.Icon className="category-icon" />
          <span className="category-name">{c.name}</span>
          <span className="category-copy">{c.copy}</span>
          <IconArrowRight className="category-arrow" />
        </Link>
      ))}
    </div>
  );
}

// ---------- Share / Newsletter ----------

export function Share() {
  const url = typeof window === "undefined" ? site.url : window.location.href;
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

export function Newsletter() {
  const [message, setMessage] = useState("");
  return (
    <section className="newsletter">
      <WaveMotif className="newsletter-wave" />
      <div className="shell newsletter-inner">
        <p className="eyebrow">Fique por dentro</p>
        <h2>Receba novos comparativos e alertas de ofertas</h2>
        <p>Integração de e-mail ainda não configurada.</p>
        <form onSubmit={(e) => {e.preventDefault(); setMessage("O formulário está pronto, mas o serviço de e-mail ainda precisa ser conectado.");}}>
          <label>Nome (opcional)<input name="name" /></label>
          <label>E-mail<input name="email" type="email" required /></label>
          <label className="check"><input required type="checkbox" /> Concordo em receber comunicações conforme a Política de Privacidade.</label>
          <button className="cta" type="submit">Quero receber</button>
          {message && <p role="status">{message}</p>}
        </form>
      </div>
    </section>
  );
}
