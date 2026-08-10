"use client";
import {useState} from "react";
import type {FormEvent} from "react";
import {useRouter} from "next/navigation";
import type {BrandWithCount} from "@/lib/brands";
import type {AdminProductRow} from "@/lib/db";

export function SourceForm({brands, products}: {brands: BrandWithCount[]; products: AdminProductRow[]}) {
  const router = useRouter();
  const [targetType, setTargetType] = useState<"brand" | "product">("product");
  const [targetId, setTargetId] = useState("");
  const [form, setForm] = useState({officialUrl: "", sourceTitle: "", country: "", language: "pt-BR", notes: ""});
  const [message, setMessage] = useState<{kind: "success" | "error"; text: string} | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (!targetId) throw new Error("Selecione a marca ou o produto associado.");
      const res = await fetch("/api/admin/sources", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          brandId: targetType === "brand" ? targetId : null,
          productId: targetType === "product" ? targetId : null,
          ...form,
        }),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || "Erro ao salvar fonte.");
      router.push("/admin/fontes");
    } catch (err) {
      setMessage({kind: "error", text: err instanceof Error ? err.message : "Não foi possível salvar."});
      setSaving(false);
    }
  }

  return (
    <>
      <div className="admin-topbar"><h1>Nova fonte oficial</h1></div>
      <div className="admin-content">
        {message && <div className="admin-alert admin-alert-error" role="alert">{message.text}</div>}
        <form onSubmit={save}>
          <section className="admin-form-section">
            <div className="admin-field-grid">
              <label className="admin-field">Associar a
                <select className="admin-select" value={targetType} onChange={(e) => {setTargetType(e.target.value as "brand" | "product"); setTargetId("");}}>
                  <option value="product">Produto</option>
                  <option value="brand">Marca</option>
                </select>
              </label>
              <label className="admin-field">{targetType === "product" ? "Produto" : "Marca"}
                <select className="admin-select" required value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                  <option value="">Selecione</option>
                  {targetType === "product"
                    ? products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)
                    : brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className="admin-field is-wide">URL oficial<input className="admin-input" required type="url" value={form.officialUrl} onChange={(e) => setForm((f) => ({...f, officialUrl: e.target.value}))} /></label>
              <label className="admin-field">Título da fonte<span className="hint">opcional</span><input className="admin-input" value={form.sourceTitle} onChange={(e) => setForm((f) => ({...f, sourceTitle: e.target.value}))} /></label>
              <label className="admin-field">País<span className="hint">opcional</span><input className="admin-input" value={form.country} onChange={(e) => setForm((f) => ({...f, country: e.target.value}))} /></label>
              <label className="admin-field">Idioma<span className="hint">opcional</span><input className="admin-input" value={form.language} onChange={(e) => setForm((f) => ({...f, language: e.target.value}))} /></label>
              <label className="admin-field is-wide">Notas<span className="hint">opcional</span><textarea className="admin-textarea" value={form.notes} onChange={(e) => setForm((f) => ({...f, notes: e.target.value}))} /></label>
            </div>
          </section>
          <div className="admin-actions-bar">
            <button className="cta" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar fonte"}</button>
          </div>
        </form>
      </div>
    </>
  );
}
