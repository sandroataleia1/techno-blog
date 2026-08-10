"use client";
import {useState} from "react";
import type {FormEvent} from "react";
import {useRouter} from "next/navigation";
import type {DbBrand} from "@/lib/brands";

export function BrandForm({brand}: {brand?: DbBrand}) {
  const router = useRouter();
  const [form, setForm] = useState({name: brand?.name ?? "", slug: brand?.slug ?? "", officialWebsite: brand?.official_website ?? "", isActive: brand ? Boolean(brand.is_active) : true});
  const [message, setMessage] = useState<{kind: "success" | "error"; text: string} | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const url = brand ? `/api/admin/brands/${brand.id}` : "/api/admin/brands";
      const res = await fetch(url, {method: brand ? "PATCH" : "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({...form, officialWebsite: form.officialWebsite || null})});
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || "Erro ao salvar marca.");
      if (brand) setMessage({kind: "success", text: "Marca atualizada."});
      else router.push("/admin/marcas");
    } catch (err) {
      setMessage({kind: "error", text: err instanceof Error ? err.message : "Não foi possível salvar."});
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="admin-topbar"><h1>{brand ? `Editar marca: ${brand.name}` : "Nova marca"}</h1></div>
      <div className="admin-content">
        {message && <div className={message.kind === "success" ? "admin-alert admin-alert-success" : "admin-alert admin-alert-error"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</div>}
        <form onSubmit={save}>
          <section className="admin-form-section">
            <div className="admin-field-grid">
              <label className="admin-field">Nome<input className="admin-input" required value={form.name} onChange={(e) => setForm((f) => ({...f, name: e.target.value}))} /></label>
              <label className="admin-field">Slug<input className="admin-input" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} onChange={(e) => setForm((f) => ({...f, slug: e.target.value}))} /></label>
              <label className="admin-field is-wide">Site oficial<span className="hint">opcional</span><input className="admin-input" type="url" value={form.officialWebsite} onChange={(e) => setForm((f) => ({...f, officialWebsite: e.target.value}))} /></label>
            </div>
            {brand && <label className="admin-checkbox" style={{marginTop: "0.8rem"}}><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({...f, isActive: e.target.checked}))} /> Marca ativa</label>}
          </section>
          <div className="admin-actions-bar">
            <button className="cta" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar marca"}</button>
          </div>
        </form>
      </div>
    </>
  );
}
