"use client";
import {useState} from "react";
import type {FormEvent} from "react";
import {useRouter} from "next/navigation";
import type {DbAffiliateOffer} from "@/lib/offers";
import {centsToBrl} from "@/lib/offers-rules";

type ProductOption = {id: string; name: string};

const STATUS_OPTIONS: {value: string; label: string}[] = [
  {value: "active", label: "Ativa"},
  {value: "inactive", label: "Inativa"},
  {value: "broken", label: "Quebrada"},
];

function toDateInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function OfferForm({offer, products}: {offer?: DbAffiliateOffer; products: ProductOption[]}) {
  const router = useRouter();
  const [form, setForm] = useState({
    productId: offer?.product_id ?? "",
    affiliateUrl: offer?.affiliate_url ?? "",
    originalProductUrl: offer?.original_product_url ?? "",
    status: String(offer?.status ?? "active"),
    isPrimary: offer ? Boolean(offer.is_primary) : true,
    currentPrice: centsToBrl(offer?.current_price_cents ?? null),
    previousPrice: centsToBrl(offer?.previous_price_cents ?? null),
    lastCheckedAt: offer ? toDateInputValue(offer.last_checked_at) : toDateInputValue(new Date().toISOString()),
    internalNote: offer?.internal_note ?? "",
  });
  const [message, setMessage] = useState<{kind: "success" | "error"; text: string} | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        productId: form.productId,
        retailer: "Mercado Livre",
        affiliateUrl: form.affiliateUrl,
        originalProductUrl: form.originalProductUrl || null,
        status: form.status,
        isPrimary: form.isPrimary,
        currentPrice: form.currentPrice.trim() || null,
        previousPrice: form.previousPrice.trim() || null,
        lastCheckedAt: form.lastCheckedAt || null,
        internalNote: form.internalNote || null,
      };
      const url = offer ? `/api/admin/offers/${offer.id}` : "/api/admin/offers";
      const res = await fetch(url, {method: offer ? "PATCH" : "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(payload)});
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || "Erro ao salvar oferta.");
      if (offer) setMessage({kind: "success", text: "Oferta salva com sucesso."});
      else router.push("/admin/ofertas");
    } catch (err) {
      setMessage({kind: "error", text: err instanceof Error ? err.message : "Não foi possível salvar."});
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!offer) return;
    if (!window.confirm(`Excluir esta oferta de ${products.find((p) => p.id === offer.product_id)?.name ?? "produto"}? Esta ação não pode ser desfeita.`)) return;
    const res = await fetch(`/api/admin/offers/${offer.id}`, {method: "DELETE"});
    if (res.ok) router.push("/admin/ofertas");
    else setMessage({kind: "error", text: "Não foi possível excluir a oferta."});
  }

  return (
    <>
      <div className="admin-topbar"><h1>{offer ? "Editar oferta" : "Nova oferta"}</h1></div>
      <div className="admin-content">
        {message && <div className={message.kind === "success" ? "admin-alert admin-alert-success" : "admin-alert admin-alert-error"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</div>}
        <form onSubmit={save}>
          <section className="admin-form-section">
            <div className="admin-field-grid">
              <label className="admin-field">Produto
                <select className="admin-select" required value={form.productId} onChange={(e) => setForm((f) => ({...f, productId: e.target.value}))}>
                  <option value="">Selecione</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="admin-field">Marketplace
                <select className="admin-select" value="Mercado Livre" disabled>
                  <option value="Mercado Livre">Mercado Livre</option>
                </select>
              </label>
              <label className="admin-field is-wide">URL afiliada<span className="hint">link curto https://meli.la/... — cole exatamente como veio do programa de afiliados. Só conferimos o formato (https + domínio meli.la); use &quot;Abrir link&quot; para checar manualmente que ele funciona.</span>
                <div className="admin-input-row">
                  <input className="admin-input" required type="url" placeholder="https://meli.la/..." value={form.affiliateUrl} onChange={(e) => setForm((f) => ({...f, affiliateUrl: e.target.value}))} />
                  {form.affiliateUrl && <a className="cta alt" href={form.affiliateUrl} target="_blank" rel="noopener noreferrer">Abrir link</a>}
                </div>
              </label>
              <label className="admin-field is-wide">URL original do produto<span className="hint">opcional — página real em mercadolivre.com.br, sem rastreamento de afiliado</span>
                <div className="admin-input-row">
                  <input className="admin-input" type="url" placeholder="https://www.mercadolivre.com.br/..." value={form.originalProductUrl} onChange={(e) => setForm((f) => ({...f, originalProductUrl: e.target.value}))} />
                  {form.originalProductUrl && <a className="cta alt" href={form.originalProductUrl} target="_blank" rel="noopener noreferrer">Abrir link</a>}
                </div>
              </label>
              <label className="admin-field">Preço atual (R$)<span className="hint">opcional — formato 219,90</span>
                <input className="admin-input" type="text" inputMode="decimal" placeholder="0,00" value={form.currentPrice} onChange={(e) => setForm((f) => ({...f, currentPrice: e.target.value}))} />
              </label>
              <label className="admin-field">Preço anterior (R$)<span className="hint">opcional — formato 219,90</span>
                <input className="admin-input" type="text" inputMode="decimal" placeholder="0,00" value={form.previousPrice} onChange={(e) => setForm((f) => ({...f, previousPrice: e.target.value}))} />
              </label>
              <label className="admin-field">Última verificação<span className="hint">data em que o preço/link foi conferido</span>
                <input className="admin-input" type="date" value={form.lastCheckedAt} onChange={(e) => setForm((f) => ({...f, lastCheckedAt: e.target.value}))} />
              </label>
              <label className="admin-field">Status
                <select className="admin-select" value={form.status} onChange={(e) => setForm((f) => ({...f, status: e.target.value}))}>
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label className="admin-field is-wide">Observação interna<span className="hint">nunca aparece no site público — uso exclusivo da equipe editorial</span>
                <textarea className="admin-textarea" value={form.internalNote} onChange={(e) => setForm((f) => ({...f, internalNote: e.target.value}))} />
              </label>
            </div>
            <label className="admin-checkbox" style={{marginTop: "0.8rem"}}>
              <input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm((f) => ({...f, isPrimary: e.target.checked}))} />
              Definir como oferta principal deste produto no Mercado Livre
            </label>
            {form.isPrimary && form.status !== "active" && <p className="small">Só uma oferta <b>ativa</b> pode ser principal — como o status não é &quot;Ativa&quot;, ela não será marcada como principal ao salvar.</p>}
          </section>
          <div className="admin-actions-bar">
            <button className="cta" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar oferta"}</button>
            {offer && <button className="cta alt" type="button" onClick={remove} style={{color: "var(--danger)"}}>Excluir oferta</button>}
          </div>
        </form>
      </div>
    </>
  );
}
