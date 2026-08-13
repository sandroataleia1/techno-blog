"use client";
import {useState} from "react";
import type {FormEvent} from "react";
import {useRouter} from "next/navigation";
import type {DbHomepageBlock, DbHomepageBlockItem} from "@/lib/homepage-blocks";
import {MAX_BLOCK_ITEMS, MAX_COLUMNS, MIN_COLUMNS, type HomepageBlockContentMode, type HomepageBlockStatus} from "@/lib/homepage-blocks-rules";

type ItemDraft = {linkUrl: string; text: string; imageId: string | null; previewUrl: string | null; uploading: boolean};

const CONTENT_MODE_OPTIONS: {value: HomepageBlockContentMode; label: string}[] = [
  {value: "photo", label: "Só foto"},
  {value: "text", label: "Só texto"},
  {value: "both", label: "Foto e texto"},
];
const STATUS_OPTIONS: {value: HomepageBlockStatus; label: string}[] = [
  {value: "draft", label: "Rascunho"},
  {value: "published", label: "Publicado"},
  {value: "archived", label: "Arquivado"},
];
const COLUMN_OPTIONS = Array.from({length: MAX_COLUMNS - MIN_COLUMNS + 1}, (_, i) => i + MIN_COLUMNS);

function toItemDraft(i: DbHomepageBlockItem): ItemDraft {
  return {linkUrl: i.link_url, text: i.text ?? "", imageId: i.image_id, previewUrl: i.image_id ? `/api/media/${i.image_id}` : null, uploading: false};
}

export function HomepageBlockForm({block, existingItems = []}: {block?: DbHomepageBlock; existingItems?: DbHomepageBlockItem[]}) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: block?.title ?? "",
    contentMode: (block?.content_mode ?? "both") as HomepageBlockContentMode,
    columns: String(block?.columns ?? 3),
    displayOrder: String(block?.display_order ?? 0),
    status: (block?.status ?? "draft") as HomepageBlockStatus,
  });
  const [items, setItems] = useState<ItemDraft[]>(existingItems.map(toItemDraft));
  const [message, setMessage] = useState<{kind: "success" | "error"; text: string} | null>(null);
  const [saving, setSaving] = useState(false);

  const needsImage = form.contentMode === "photo" || form.contentMode === "both";
  const needsText = form.contentMode === "text" || form.contentMode === "both";
  const canDelete = Boolean(block) && block?.status === "draft";

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
    if (items.length >= MAX_BLOCK_ITEMS) return;
    setItems((list) => [...list, {linkUrl: "", text: "", imageId: null, previewUrl: null, uploading: false}]);
  }

  async function uploadImage(index: number, file: File) {
    updateItem(index, {uploading: true});
    try {
      const body = new FormData();
      body.set("image", file);
      const res = await fetch("/api/admin/media", {method: "POST", body});
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || "Falha ao enviar imagem.");
      updateItem(index, {imageId: saved.id, previewUrl: saved.url, uploading: false});
    } catch (err) {
      updateItem(index, {uploading: false});
      setMessage({kind: "error", text: err instanceof Error ? err.message : "Não foi possível enviar a imagem."});
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        title: form.title,
        contentMode: form.contentMode,
        columns: Number(form.columns),
        displayOrder: Number(form.displayOrder) || 0,
        status: form.status,
        items: items.map((i) => ({linkUrl: i.linkUrl, text: i.text, imageId: i.imageId})),
      };
      const url = block ? `/api/admin/homepage-blocks/${block.id}` : "/api/admin/homepage-blocks";
      const res = await fetch(url, {method: block ? "PATCH" : "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(payload)});
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || "Erro ao salvar bloco.");
      if (block) {
        setMessage({kind: "success", text: "Bloco salvo com sucesso."});
        router.refresh();
      } else {
        router.push(`/admin/blocos/${saved.id}/editar`);
      }
    } catch (err) {
      setMessage({kind: "error", text: err instanceof Error ? err.message : "Não foi possível salvar."});
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!block) return;
    if (!window.confirm(`Excluir o bloco "${block.title}"? Esta ação não pode ser desfeita.`)) return;
    const res = await fetch(`/api/admin/homepage-blocks/${block.id}`, {method: "DELETE"});
    if (res.ok) router.push("/admin/blocos");
    else {
      const body = await res.json().catch(() => ({}));
      setMessage({kind: "error", text: body.error || "Não foi possível excluir o bloco."});
    }
  }

  return (
    <>
      <div className="admin-topbar"><h1>{block ? `Editar: ${block.title}` : "Novo bloco"}</h1></div>
      <div className="admin-content">
        {message && <div className={message.kind === "success" ? "admin-alert admin-alert-success" : "admin-alert admin-alert-error"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</div>}
        <form onSubmit={save}>
          <section className="admin-form-section">
            <h2>Configuração do bloco</h2>
            <div className="admin-field-grid">
              <label className="admin-field">Título<input className="admin-input" required value={form.title} onChange={(e) => setForm((f) => ({...f, title: e.target.value}))} /></label>
              <label className="admin-field">Conteúdo do item
                <select className="admin-select" value={form.contentMode} onChange={(e) => setForm((f) => ({...f, contentMode: e.target.value as HomepageBlockContentMode}))}>
                  {CONTENT_MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="admin-field">Colunas
                <select className="admin-select" value={form.columns} onChange={(e) => setForm((f) => ({...f, columns: e.target.value}))}>
                  {COLUMN_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="admin-field">Ordem de exibição<span className="hint">blocos com número menor aparecem primeiro</span>
                <input className="admin-input" type="number" value={form.displayOrder} onChange={(e) => setForm((f) => ({...f, displayOrder: e.target.value}))} />
              </label>
              <label className="admin-field">Status
                <select className="admin-select" value={form.status} onChange={(e) => setForm((f) => ({...f, status: e.target.value as HomepageBlockStatus}))}>
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="admin-form-section">
            <h2>Itens ({items.length}/{MAX_BLOCK_ITEMS})</h2>
            <p className="admin-section-hint">Cada item vira um card na grade. Todo item precisa de um link. {needsImage && "Neste modo, imagem é obrigatória para publicar. "}{needsText && "Neste modo, texto é obrigatório para publicar."}</p>

            {items.length === 0 && <p className="admin-empty" style={{padding: "1.5rem"}}>Nenhum item adicionado ainda.</p>}

            {items.map((item, index) => (
              <div className="admin-ranking-item" key={index}>
                <div className="admin-ranking-item-head">
                  <span className="admin-ranking-position" aria-hidden="true">{index + 1}</span>
                  <strong>Item {index + 1}</strong>
                  <div className="admin-ranking-item-actions">
                    <button className="cta alt" type="button" disabled={index === 0} aria-label={`Mover item ${index + 1} para cima`} onClick={() => moveUp(index)}>↑</button>
                    <button className="cta alt" type="button" disabled={index === items.length - 1} aria-label={`Mover item ${index + 1} para baixo`} onClick={() => moveDown(index)}>↓</button>
                    <button className="cta alt" type="button" style={{color: "var(--danger)"}} aria-label={`Remover item ${index + 1}`} onClick={() => removeItem(index)}>Remover</button>
                  </div>
                </div>
                <div className="admin-field-grid">
                  <label className="admin-field is-wide">Link<input className="admin-input" required value={item.linkUrl} onChange={(e) => updateItem(index, {linkUrl: e.target.value})} placeholder="/melhores-fones-mercado-livre ou https://…" /></label>
                  {needsText && (
                    <label className="admin-field is-wide">Texto<textarea className="admin-textarea" value={item.text} onChange={(e) => updateItem(index, {text: e.target.value})} /></label>
                  )}
                  {needsImage && (
                    <label className="admin-field is-wide">Imagem
                      <input className="admin-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadImage(index, file); }} />
                      {item.uploading && <span className="hint">Enviando…</span>}
                      {item.previewUrl && !item.uploading && (
                        // eslint-disable-next-line @next/next/no-img-element -- admin-only preview of a freshly uploaded, arbitrarily-sized asset; not a public page image
                        <img src={item.previewUrl} alt="" style={{marginTop: "0.5rem", maxWidth: "160px", maxHeight: "120px", objectFit: "cover", borderRadius: "var(--radius-sm)"}} />
                      )}
                    </label>
                  )}
                </div>
              </div>
            ))}

            {items.length < MAX_BLOCK_ITEMS && (
              <div className="admin-input-row" style={{marginTop: "1rem"}}>
                <button className="cta alt" type="button" onClick={addItem}>Adicionar item</button>
              </div>
            )}
          </section>

          <div className="admin-actions-bar">
            <button className="cta" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar bloco"}</button>
            {canDelete && <button className="cta alt" type="button" onClick={remove} style={{color: "var(--danger)"}}>Excluir bloco</button>}
          </div>
        </form>
      </div>
    </>
  );
}
