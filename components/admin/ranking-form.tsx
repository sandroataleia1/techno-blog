"use client";
import {useState} from "react";
import type {FormEvent} from "react";
import {useRouter} from "next/navigation";
import type {CategoryWithCount} from "@/lib/categories";
import type {DbRanking, RankingItemWithProduct} from "@/lib/rankings";
import {MAX_DRAFT_ITEMS, REQUIRED_PUBLISHED_ITEMS} from "@/lib/rankings-rules";

type ProductOption = {id: string; name: string; status: string; is_active: number};
type ItemDraft = {productId: string; badge: string; reason: string; mainBenefit: string; mainLimitation: string};

const STATUS_OPTIONS: {value: string; label: string}[] = [
  {value: "draft", label: "Rascunho"},
  {value: "published", label: "Publicado"},
  {value: "archived", label: "Arquivado"},
];

function toItemDraft(i: RankingItemWithProduct): ItemDraft {
  return {productId: i.product_id, badge: i.badge ?? "", reason: i.reason ?? "", mainBenefit: i.main_benefit ?? "", mainLimitation: i.main_limitation ?? ""};
}

export function RankingForm({ranking, categories, products, existingItems = []}: {
  ranking?: DbRanking;
  categories: CategoryWithCount[];
  products: ProductOption[];
  existingItems?: RankingItemWithProduct[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: ranking?.title ?? "",
    slug: ranking?.slug ?? "",
    categoryId: ranking?.category_id ?? categories[0]?.id ?? "",
    description: ranking?.description ?? "",
    methodology: ranking?.methodology ?? "",
    status: String(ranking?.status ?? "draft"),
  });
  const [items, setItems] = useState<ItemDraft[]>(existingItems.map(toItemDraft));
  const [addProductId, setAddProductId] = useState("");
  const [message, setMessage] = useState<{kind: "success" | "error"; text: string} | null>(null);
  const [saving, setSaving] = useState(false);

  const slugLocked = Boolean(ranking?.published_at);
  const productById = new Map(products.map((p) => [p.id, p]));
  const availableProducts = products.filter((p) => !items.some((i) => i.productId === p.id));
  const canDelete = Boolean(ranking) && !ranking?.published_at;

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((list) => list.map((it, i) => (i === index ? {...it, ...patch} : it)));
  }
  function removeItem(index: number) {
    setItems((list) => list.filter((_, i) => i !== index));
  }
  function moveUp(index: number) {
    if (index === 0) return;
    setItems((list) => {
      const next = [...list];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }
  function moveDown(index: number) {
    setItems((list) => {
      if (index >= list.length - 1) return list;
      const next = [...list];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }
  function addItem() {
    if (!addProductId || items.length >= MAX_DRAFT_ITEMS) return;
    setItems((list) => [...list, {productId: addProductId, badge: "", reason: "", mainBenefit: "", mainLimitation: ""}]);
    setAddProductId("");
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        title: form.title,
        slug: form.slug,
        categoryId: form.categoryId || null,
        description: form.description || null,
        methodology: form.methodology || null,
        status: form.status,
        items,
      };
      const url = ranking ? `/api/admin/rankings/${ranking.id}` : "/api/admin/rankings";
      const res = await fetch(url, {method: ranking ? "PATCH" : "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(payload)});
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || "Erro ao salvar ranking.");
      if (ranking) {
        setMessage({kind: "success", text: "Ranking salvo com sucesso."});
        router.refresh();
      } else {
        router.push(`/admin/rankings/${saved.id}/editar`);
      }
    } catch (err) {
      setMessage({kind: "error", text: err instanceof Error ? err.message : "Não foi possível salvar."});
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!ranking) return;
    if (!window.confirm(`Excluir o ranking "${ranking.title}"? Esta ação não pode ser desfeita.`)) return;
    const res = await fetch(`/api/admin/rankings/${ranking.id}`, {method: "DELETE"});
    if (res.ok) router.push("/admin/rankings");
    else {
      const body = await res.json().catch(() => ({}));
      setMessage({kind: "error", text: body.error || "Não foi possível excluir o ranking."});
    }
  }

  return (
    <>
      <div className="admin-topbar"><h1>{ranking ? `Editar: ${ranking.title}` : "Novo ranking"}</h1></div>
      <div className="admin-content">
        {message && <div className={message.kind === "success" ? "admin-alert admin-alert-success" : "admin-alert admin-alert-error"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</div>}
        <form onSubmit={save}>
          <section className="admin-form-section">
            <h2>Dados editoriais</h2>
            <div className="admin-field-grid">
              <label className="admin-field">Título<input className="admin-input" required value={form.title} onChange={(e) => setForm((f) => ({...f, title: e.target.value}))} /></label>
              <label className="admin-field">Slug{slugLocked && <span className="hint">bloqueado após a primeira publicação</span>}
                <input className="admin-input" required pattern="[a-z0-9]+(-[a-z0-9]+)*" disabled={slugLocked} value={form.slug} onChange={(e) => setForm((f) => ({...f, slug: e.target.value}))} />
              </label>
              <label className="admin-field">Categoria
                <select className="admin-select" required value={form.categoryId} onChange={(e) => setForm((f) => ({...f, categoryId: e.target.value}))}>
                  <option value="">Selecione</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="admin-field">Status
                <select className="admin-select" value={form.status} onChange={(e) => setForm((f) => ({...f, status: e.target.value}))}>
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label className="admin-field is-wide">Introdução/descrição<span className="hint">obrigatória para publicar</span>
                <textarea className="admin-textarea" value={form.description} onChange={(e) => setForm((f) => ({...f, description: e.target.value}))} />
              </label>
              <label className="admin-field is-wide">Metodologia<span className="hint">obrigatória para publicar — como os produtos foram avaliados/escolhidos</span>
                <textarea className="admin-textarea" value={form.methodology} onChange={(e) => setForm((f) => ({...f, methodology: e.target.value}))} />
              </label>
            </div>
          </section>

          <section className="admin-form-section">
            <h2>Produtos ({items.length}/{REQUIRED_PUBLISHED_ITEMS})</h2>
            <p className="admin-section-hint">
              {items.length === REQUIRED_PUBLISHED_ITEMS
                ? "10 produtos — pronto para publicar, desde que todo o conteúdo editorial de cada item esteja preenchido."
                : `São necessários exatamente ${REQUIRED_PUBLISHED_ITEMS} produtos para publicar. Rascunhos podem ter de 0 a ${MAX_DRAFT_ITEMS}.`}
            </p>

            {items.length === 0 && <p className="admin-empty" style={{padding: "1.5rem"}}>Nenhum produto adicionado ainda.</p>}

            {items.map((item, index) => {
              const product = productById.get(item.productId);
              return (
                <div className="admin-ranking-item" key={item.productId}>
                  <div className="admin-ranking-item-head">
                    <span className="admin-ranking-position" aria-hidden="true">{index + 1}</span>
                    <strong>{product?.name ?? "Produto removido"}</strong>
                    <div className="admin-ranking-item-actions">
                      <button className="cta alt" type="button" disabled={index === 0} aria-label={`Mover ${product?.name ?? "produto"} para cima`} onClick={() => moveUp(index)}>↑</button>
                      <button className="cta alt" type="button" disabled={index === items.length - 1} aria-label={`Mover ${product?.name ?? "produto"} para baixo`} onClick={() => moveDown(index)}>↓</button>
                      <button className="cta alt" type="button" style={{color: "var(--danger)"}} aria-label={`Remover ${product?.name ?? "produto"}`} onClick={() => removeItem(index)}>Remover</button>
                    </div>
                  </div>
                  <div className="admin-field-grid">
                    <label className="admin-field">Selo editorial<input className="admin-input" value={item.badge} onChange={(e) => updateItem(index, {badge: e.target.value})} /></label>
                    <label className="admin-field">Motivo da posição<input className="admin-input" value={item.reason} onChange={(e) => updateItem(index, {reason: e.target.value})} /></label>
                    <label className="admin-field is-wide">Principal benefício<input className="admin-input" value={item.mainBenefit} onChange={(e) => updateItem(index, {mainBenefit: e.target.value})} /></label>
                    <label className="admin-field is-wide">Principal limitação<input className="admin-input" value={item.mainLimitation} onChange={(e) => updateItem(index, {mainLimitation: e.target.value})} /></label>
                  </div>
                </div>
              );
            })}

            {items.length < MAX_DRAFT_ITEMS && (
              <div className="admin-input-row" style={{marginTop: "1rem"}}>
                <select className="admin-select" value={addProductId} onChange={(e) => setAddProductId(e.target.value)}>
                  <option value="">Selecione um produto para adicionar</option>
                  {availableProducts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{!p.is_active || p.status !== "published" ? " — não elegível para publicação" : ""}</option>
                  ))}
                </select>
                <button className="cta alt" type="button" disabled={!addProductId} onClick={addItem}>Adicionar produto</button>
              </div>
            )}
          </section>

          <div className="admin-actions-bar">
            <button className="cta" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar ranking"}</button>
            {canDelete && <button className="cta alt" type="button" onClick={remove} style={{color: "var(--danger)"}}>Excluir ranking</button>}
          </div>
        </form>
      </div>
    </>
  );
}
