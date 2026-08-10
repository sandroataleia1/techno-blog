"use client";
import {useState} from "react";
import type {FormEvent} from "react";
import {useRouter} from "next/navigation";
import type {CategoryWithCount} from "@/lib/categories";
import type {DbSpecDefinition} from "@/lib/specifications";

export function SpecificationForm({definition, categories}: {definition?: DbSpecDefinition; categories: CategoryWithCount[]}) {
  const router = useRouter();
  const [form, setForm] = useState({
    categoryId: definition?.category_id ?? categories[0]?.id ?? "",
    key: definition?.key ?? "",
    label: definition?.label ?? "",
    dataType: definition?.data_type ?? "text",
    unit: definition?.unit ?? "",
    comparisonOrder: definition?.comparison_order ?? 0,
    isKeySpecification: definition ? Boolean(definition.is_key_specification) : false,
  });
  const [message, setMessage] = useState<{kind: "success" | "error"; text: string} | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const url = definition ? `/api/admin/specification-definitions/${definition.id}` : "/api/admin/specification-definitions";
      const res = await fetch(url, {
        method: definition ? "PATCH" : "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({...form, unit: form.unit || null, comparisonOrder: Number(form.comparisonOrder)}),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || "Erro ao salvar especificação.");
      if (definition) setMessage({kind: "success", text: "Especificação atualizada."});
      else router.push("/admin/especificacoes");
    } catch (err) {
      setMessage({kind: "error", text: err instanceof Error ? err.message : "Não foi possível salvar."});
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="admin-topbar"><h1>{definition ? `Editar especificação: ${definition.label}` : "Nova definição de especificação"}</h1></div>
      <div className="admin-content">
        {message && <div className={message.kind === "success" ? "admin-alert admin-alert-success" : "admin-alert admin-alert-error"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</div>}
        <form onSubmit={save}>
          <section className="admin-form-section">
            <p className="admin-section-hint">Cada categoria tem seu próprio conjunto de especificações — isto evita hardcodar campos de fones para outras categorias como celulares ou notebooks.</p>
            <div className="admin-field-grid">
              <label className="admin-field">Categoria
                <select className="admin-select" required disabled={Boolean(definition)} value={form.categoryId} onChange={(e) => setForm((f) => ({...f, categoryId: e.target.value}))}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="admin-field">Chave<span className="hint">identificador interno, ex: bateria</span><input className="admin-input" required pattern="[a-z0-9_]+" disabled={Boolean(definition)} value={form.key} onChange={(e) => setForm((f) => ({...f, key: e.target.value}))} /></label>
              <label className="admin-field">Rótulo<span className="hint">exibido para o visitante, ex: Bateria</span><input className="admin-input" required value={form.label} onChange={(e) => setForm((f) => ({...f, label: e.target.value}))} /></label>
              <label className="admin-field">Tipo de dado
                <select className="admin-select" value={form.dataType} onChange={(e) => setForm((f) => ({...f, dataType: e.target.value as typeof form.dataType}))}>
                  <option value="text">Texto</option>
                  <option value="number">Número</option>
                  <option value="boolean">Sim/Não</option>
                </select>
              </label>
              <label className="admin-field">Unidade<span className="hint">opcional, ex: horas, g, mAh</span><input className="admin-input" value={form.unit} onChange={(e) => setForm((f) => ({...f, unit: e.target.value}))} /></label>
              <label className="admin-field">Ordem de comparação<input className="admin-input" type="number" value={form.comparisonOrder} onChange={(e) => setForm((f) => ({...f, comparisonOrder: Number(e.target.value)}))} /></label>
            </div>
            <label className="admin-checkbox" style={{marginTop: "0.8rem"}}><input type="checkbox" checked={form.isKeySpecification} onChange={(e) => setForm((f) => ({...f, isKeySpecification: e.target.checked}))} /> Especificação-chave (aparece na ficha rápida)</label>
          </section>
          <div className="admin-actions-bar">
            <button className="cta" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar especificação"}</button>
          </div>
        </form>
      </div>
    </>
  );
}
