"use client";
import Link from "next/link";
import {useMemo, useState} from "react";
import type {ChangeEvent, FormEvent} from "react";
import {useRouter} from "next/navigation";
import type {BrandWithCount} from "@/lib/brands";
import type {CategoryWithCount} from "@/lib/categories";
import type {ProductSpecificationWithDefinition, SpecDefinitionWithCategory} from "@/lib/specifications";
import type {DbManufacturerSource} from "@/lib/sources";
import type {DbProduct} from "@/lib/db";

type Props = {
  mode: "create" | "edit";
  product?: DbProduct;
  brands: BrandWithCount[];
  categories: CategoryWithCount[];
  specDefinitions: SpecDefinitionWithCategory[];
  existingSpecs?: ProductSpecificationWithDefinition[];
  existingSources?: DbManufacturerSource[];
};

const linesToArray = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
const arrayToLines = (v: unknown) => (Array.isArray(v) ? v.join("\n") : "");

function parseLegacySpecs(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function ProductForm({mode, product, brands, categories, specDefinitions, existingSpecs = [], existingSources = []}: Props) {
  const router = useRouter();
  const legacySpecs = useMemo(() => parseLegacySpecs(product?.specifications), [product]);

  const [form, setForm] = useState({
    name: product?.name ?? "",
    slug: product?.slug ?? "",
    brandId: product?.brand_id ?? "",
    model: product?.model ?? "",
    categoryId: product?.category_id ?? "",
    position: product?.position ?? 1,
    badge: product?.badge ?? "",
    status: product?.status ?? "published",
    shortDescription: product?.short_description ?? "",
    fullDescription: product?.full_description ?? "",
    editorialSummary: product?.editorial_summary ?? "",
    verdict: product?.verdict ?? "",
    benefits: arrayToLines(product ? JSON.parse(product.benefits) : []),
    attentionPoints: arrayToLines(product ? JSON.parse(product.attention_points) : []),
    recommendedFor: arrayToLines(product ? JSON.parse(product.recommended_for) : []),
    notRecommendedFor: arrayToLines(product ? JSON.parse(product.not_recommended_for) : []),
    officialUrl: product?.official_url ?? "",
    affiliateUrl: product?.affiliate_url ?? "https://lista.mercadolivre.com.br/",
    searchUrl: product?.search_url ?? "https://lista.mercadolivre.com.br/",
    imageAlt: product?.image_alt ?? "Imagem do produto",
    isActive: product ? Boolean(product.is_active) : true,
    isFeatured: product ? Boolean(product.is_featured) : false,
  });

  const initialSpecValues = useMemo(() => {
    const byDef: Record<string, {text: string; number: string; bool: boolean}> = {};
    for (const s of existingSpecs) {
      byDef[s.specification_definition_id] = {text: s.value_text ?? "", number: s.value_number != null ? String(s.value_number) : "", bool: Boolean(s.value_boolean)};
    }
    // Fall back to the legacy JSON blob for products migrated before the normalized table existed and not yet re-saved.
    if (existingSpecs.length === 0 && Object.keys(legacySpecs).length) {
      for (const d of specDefinitions) {
        if (d.category_id === product?.category_id && legacySpecs[d.label] !== undefined) {
          byDef[d.id] = {text: legacySpecs[d.label], number: "", bool: false};
        }
      }
    }
    return byDef;
  }, [existingSpecs, legacySpecs, specDefinitions, product]);

  const [specValues, setSpecValues] = useState(initialSpecValues);
  const [message, setMessage] = useState<{kind: "success" | "error"; text: string} | null>(null);
  const [saving, setSaving] = useState(false);
  const [sourceDraft, setSourceDraft] = useState({officialUrl: "", sourceTitle: "", country: "", language: "pt-BR"});
  const [sources, setSources] = useState(existingSources);

  const visibleSpecDefs = specDefinitions.filter((d) => d.category_id === form.categoryId);

  const field = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({...f, [key]: e.target.value}));

  function specDisplayValue(def: SpecDefinitionWithCategory): string {
    const v = specValues[def.id];
    if (!v) return "";
    if (def.data_type === "boolean") return v.bool ? "Sim" : "Não";
    if (def.data_type === "number") return v.number;
    return v.text;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const specificationsJson: Record<string, string> = {};
      for (const def of visibleSpecDefs) {
        const display = specDisplayValue(def);
        if (display) specificationsJson[def.label] = display;
      }
      const payload = {
        ...form,
        position: Number(form.position),
        benefits: linesToArray(form.benefits),
        attentionPoints: linesToArray(form.attentionPoints),
        recommendedFor: linesToArray(form.recommendedFor),
        notRecommendedFor: linesToArray(form.notRecommendedFor),
        specifications: specificationsJson,
      };
      const url = mode === "create" ? "/api/admin/products" : `/api/admin/products/${product!.id}`;
      const res = await fetch(url, {method: mode === "create" ? "POST" : "PATCH", headers: {"content-type": "application/json"}, body: JSON.stringify(payload)});
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || "Erro ao salvar produto.");

      const productId = saved.id ?? product?.id;
      const specValuesPayload = visibleSpecDefs.map((def) => {
        const v = specValues[def.id];
        return {
          specificationDefinitionId: def.id,
          valueText: def.data_type === "text" ? v?.text || null : null,
          valueNumber: def.data_type === "number" && v?.number ? Number(v.number) : null,
          valueBoolean: def.data_type === "boolean" ? Boolean(v?.bool) : null,
        };
      });
      const specRes = await fetch(`/api/admin/products/${productId}/specifications`, {method: "PUT", headers: {"content-type": "application/json"}, body: JSON.stringify({values: specValuesPayload})});
      if (!specRes.ok) throw new Error("Produto salvo, mas as especificações não puderam ser atualizadas.");

      if (mode === "edit") {
        setMessage({kind: "success", text: "Produto salvo com sucesso."});
      } else {
        router.push(`/admin/produtos/${productId}/editar`);
      }
    } catch (err) {
      setMessage({kind: "error", text: err instanceof Error ? err.message : "Não foi possível salvar."});
    } finally {
      setSaving(false);
    }
  }

  async function addSource(e: FormEvent) {
    e.preventDefault();
    if (!product) return;
    setMessage(null);
    try {
      const res = await fetch("/api/admin/sources", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({productId: product.id, ...sourceDraft}),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || "Não foi possível cadastrar a fonte.");
      setSources((s) => [saved, ...s]);
      setSourceDraft({officialUrl: "", sourceTitle: "", country: "", language: "pt-BR"});
      setMessage({kind: "success", text: "Fonte oficial cadastrada."});
    } catch (err) {
      setMessage({kind: "error", text: err instanceof Error ? err.message : "Erro ao cadastrar fonte."});
    }
  }

  const sourceStatusLabel: Record<string, string> = {pending: "Pendente de revisão", approved: "Aprovada", rejected: "Rejeitada"};
  const sourceStatusBadge: Record<string, string> = {pending: "badge-neutral", approved: "badge-positive", rejected: "badge-muted"};

  return (
    <>
      <div className="admin-topbar">
        <h1>{mode === "create" ? "Novo produto" : `Editar: ${product?.name}`}</h1>
      </div>
      <div className="admin-content">
        {message && <div className={message.kind === "success" ? "admin-alert admin-alert-success" : "admin-alert admin-alert-error"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</div>}
        <form onSubmit={save}>
          <section className="admin-form-section">
            <h2>Identificação</h2>
            <p className="admin-section-hint">Como o produto é identificado no catálogo.</p>
            <div className="admin-field-grid">
              <label className="admin-field">Nome<input className="admin-input" required value={form.name} onChange={field("name")} /></label>
              <label className="admin-field">Slug<input className="admin-input" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} onChange={field("slug")} /></label>
              <label className="admin-field">Marca
                <select className="admin-select" required value={form.brandId} onChange={field("brandId")}>
                  <option value="">Selecione</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className="admin-field">Modelo<span className="hint">opcional</span><input className="admin-input" value={form.model} onChange={field("model")} /></label>
              <label className="admin-field">Categoria
                <select className="admin-select" required value={form.categoryId} onChange={field("categoryId")}>
                  <option value="">Selecione</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="admin-field">Posição no ranking<input className="admin-input" required type="number" min={1} value={form.position} onChange={field("position")} /></label>
              <label className="admin-field">Selo editorial<input className="admin-input" required value={form.badge} onChange={field("badge")} /></label>
              <label className="admin-field">Status
                <select className="admin-select" value={form.status} onChange={field("status")}>
                  <option value="draft">Rascunho</option>
                  <option value="published">Publicado</option>
                  <option value="archived">Arquivado</option>
                </select>
              </label>
            </div>
          </section>

          <section className="admin-form-section">
            <h2>Editorial</h2>
            <p className="admin-section-hint">Conteúdo exibido nas páginas públicas.</p>
            <div className="admin-field-grid">
              <label className="admin-field is-wide">Descrição curta<textarea className="admin-textarea" required value={form.shortDescription} onChange={field("shortDescription")} /></label>
              <label className="admin-field is-wide">Descrição completa<textarea className="admin-textarea" required value={form.fullDescription} onChange={field("fullDescription")} /></label>
              <label className="admin-field is-wide">Resumo editorial<span className="hint">opcional — visão geral curta para uso futuro em fichas e cards</span><textarea className="admin-textarea" value={form.editorialSummary} onChange={field("editorialSummary")} /></label>
              <label className="admin-field is-wide">Veredito<span className="hint">opcional — frase de conclusão editorial</span><input className="admin-input" value={form.verdict} onChange={field("verdict")} /></label>
              <label className="admin-field is-wide">Benefícios<span className="hint">um por linha</span><textarea className="admin-textarea" value={form.benefits} onChange={field("benefits")} /></label>
              <label className="admin-field is-wide">Pontos de atenção<span className="hint">um por linha</span><textarea className="admin-textarea" value={form.attentionPoints} onChange={field("attentionPoints")} /></label>
              <label className="admin-field">Indicado para<span className="hint">um por linha</span><textarea className="admin-textarea" value={form.recommendedFor} onChange={field("recommendedFor")} /></label>
              <label className="admin-field">Não indicado para<span className="hint">um por linha</span><textarea className="admin-textarea" value={form.notRecommendedFor} onChange={field("notRecommendedFor")} /></label>
            </div>
          </section>

          <section className="admin-form-section">
            <h2>Links</h2>
            <div className="admin-field-grid">
              <label className="admin-field is-wide">URL oficial do fabricante<span className="hint">opcional</span><input className="admin-input" type="url" value={form.officialUrl} onChange={field("officialUrl")} /></label>
              <label className="admin-field">Link de afiliado (Mercado Livre)<input className="admin-input" required type="url" value={form.affiliateUrl} onChange={field("affiliateUrl")} /></label>
              <label className="admin-field">Link de busca<input className="admin-input" required type="url" value={form.searchUrl} onChange={field("searchUrl")} /></label>
              <label className="admin-field is-wide">Texto alternativo da imagem<input className="admin-input" required value={form.imageAlt} onChange={field("imageAlt")} /></label>
            </div>
            <label className="admin-checkbox" style={{marginTop: "0.8rem"}}><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({...f, isActive: e.target.checked}))} /> Produto ativo (visível publicamente)</label>
            <label className="admin-checkbox"><input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm((f) => ({...f, isFeatured: e.target.checked}))} /> Em destaque</label>
          </section>

          <section className="admin-form-section">
            <h2>Especificações</h2>
            <p className="admin-section-hint">Definidas por categoria. {!form.categoryId && "Selecione uma categoria acima para ver os campos disponíveis."}</p>
            {form.categoryId && visibleSpecDefs.length === 0 && <p className="admin-empty" style={{padding: "1rem"}}>Nenhuma especificação definida para esta categoria ainda. <Link className="admin-row-link" href="/admin/especificacoes/novo">Criar definição</Link></p>}
            {visibleSpecDefs.map((def) => (
              <div className="admin-spec-row" key={def.id}>
                <label className="admin-field">{def.label}{def.unit ? ` (${def.unit})` : ""}
                  {def.data_type === "text" && <input className="admin-input" value={specValues[def.id]?.text ?? ""} onChange={(e) => setSpecValues((s) => ({...s, [def.id]: {...s[def.id], text: e.target.value, number: "", bool: false}}))} />}
                  {def.data_type === "number" && <input className="admin-input" type="number" step="any" value={specValues[def.id]?.number ?? ""} onChange={(e) => setSpecValues((s) => ({...s, [def.id]: {...s[def.id], number: e.target.value, text: "", bool: false}}))} />}
                  {def.data_type === "boolean" && (
                    <select className="admin-select" value={specValues[def.id]?.bool ? "sim" : "nao"} onChange={(e) => setSpecValues((s) => ({...s, [def.id]: {...s[def.id], bool: e.target.value === "sim", text: "", number: ""}}))}>
                      <option value="nao">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  )}
                </label>
                {def.is_key_specification ? <span className="badge badge-positive" style={{alignSelf: "center"}}>Ficha rápida</span> : <span />}
              </div>
            ))}
          </section>

          <div className="admin-actions-bar">
            <button className="cta" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar produto"}</button>
          </div>
        </form>

        <section className="admin-form-section">
          <h2>Fontes oficiais</h2>
          {!product ? (
            <p className="admin-section-hint">Salve o produto para poder associar fontes oficiais do fabricante.</p>
          ) : (
            <>
              {sources.length === 0 && <p className="admin-section-hint">Nenhuma fonte oficial cadastrada ainda.</p>}
              {sources.map((s) => (
                <div className="admin-source-item" key={s.id}>
                  <h4><a href={s.official_url} target="_blank" rel="noopener noreferrer">{s.source_title || s.official_url}</a></h4>
                  <div className="admin-source-meta">
                    <span className={`badge ${sourceStatusBadge[s.status]}`}>{sourceStatusLabel[s.status]}</span>
                    {s.country && <span>{s.country}</span>}
                    {s.language && <span>{s.language}</span>}
                  </div>
                </div>
              ))}
              <div className="admin-field-grid" style={{marginTop: "1rem"}}>
                <label className="admin-field is-wide">URL oficial<input className="admin-input" type="url" value={sourceDraft.officialUrl} onChange={(e) => setSourceDraft((s) => ({...s, officialUrl: e.target.value}))} /></label>
                <label className="admin-field">Título da fonte<input className="admin-input" value={sourceDraft.sourceTitle} onChange={(e) => setSourceDraft((s) => ({...s, sourceTitle: e.target.value}))} /></label>
                <label className="admin-field">País<input className="admin-input" value={sourceDraft.country} onChange={(e) => setSourceDraft((s) => ({...s, country: e.target.value}))} /></label>
                <label className="admin-field">Idioma<input className="admin-input" value={sourceDraft.language} onChange={(e) => setSourceDraft((s) => ({...s, language: e.target.value}))} /></label>
              </div>
              <button className="cta alt" type="button" onClick={addSource} style={{marginTop: "0.6rem"}}>Adicionar fonte oficial</button>
            </>
          )}
        </section>
      </div>
    </>
  );
}
