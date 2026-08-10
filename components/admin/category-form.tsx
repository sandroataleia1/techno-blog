"use client";
import {useState} from "react";
import type {FormEvent} from "react";
import {useRouter} from "next/navigation";
import type {DbCategory} from "@/lib/categories";

export function CategoryForm({category}: {category?: DbCategory}) {
  const router = useRouter();
  const [form, setForm] = useState({name: category?.name ?? "", slug: category?.slug ?? "", description: category?.description ?? "", isActive: category ? Boolean(category.is_active) : true});
  const [message, setMessage] = useState<{kind: "success" | "error"; text: string} | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const url = category ? `/api/admin/categories/${category.id}` : "/api/admin/categories";
      const res = await fetch(url, {method: category ? "PATCH" : "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({...form, description: form.description || null})});
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || "Erro ao salvar categoria.");
      if (category) setMessage({kind: "success", text: "Categoria atualizada."});
      else router.push("/admin/categorias");
    } catch (err) {
      setMessage({kind: "error", text: err instanceof Error ? err.message : "Não foi possível salvar."});
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="admin-topbar"><h1>{category ? `Editar categoria: ${category.name}` : "Nova categoria"}</h1></div>
      <div className="admin-content">
        {message && <div className={message.kind === "success" ? "admin-alert admin-alert-success" : "admin-alert admin-alert-error"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</div>}
        <form onSubmit={save}>
          <section className="admin-form-section">
            <div className="admin-field-grid">
              <label className="admin-field">Nome<input className="admin-input" required value={form.name} onChange={(e) => setForm((f) => ({...f, name: e.target.value}))} /></label>
              <label className="admin-field">Slug<input className="admin-input" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} onChange={(e) => setForm((f) => ({...f, slug: e.target.value}))} /></label>
              <label className="admin-field is-wide">Descrição<span className="hint">opcional</span><textarea className="admin-textarea" value={form.description} onChange={(e) => setForm((f) => ({...f, description: e.target.value}))} /></label>
            </div>
            {category && <label className="admin-checkbox" style={{marginTop: "0.8rem"}}><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({...f, isActive: e.target.checked}))} /> Categoria ativa</label>}
          </section>
          <div className="admin-actions-bar">
            <button className="cta" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar categoria"}</button>
          </div>
        </form>
      </div>
    </>
  );
}
