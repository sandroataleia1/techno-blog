import Link from "next/link";
import {listSources} from "@/lib/sources";
import {SourceStatus} from "@/components/admin/source-status";

export const dynamic = "force-dynamic";

export default function AdminSources() {
  const sources = listSources();
  return (
    <>
      <div className="admin-topbar">
        <h1>Fontes oficiais</h1>
        <div className="admin-topbar-actions">
          <Link className="cta" href="/admin/fontes/novo">Nova fonte</Link>
        </div>
      </div>
      <div className="admin-content">
        <p className="small" style={{marginTop: 0}}>Cadastro manual de URLs oficiais do fabricante. Nada aqui é coletado automaticamente — a coleta assistida é uma fase futura.</p>
        {sources.length === 0 ? (
          <div className="admin-empty">
            <p>Nenhuma fonte oficial cadastrada ainda.</p>
            <Link className="cta" href="/admin/fontes/novo">Cadastrar primeira fonte</Link>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Fonte</th><th>Associada a</th><th>País/Idioma</th><th>Status</th></tr></thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td><a href={s.official_url} target="_blank" rel="noopener noreferrer">{s.source_title || s.official_url}</a></td>
                    <td>{s.product_name ? `Produto: ${s.product_name}` : s.brand_name ? `Marca: ${s.brand_name}` : "—"}</td>
                    <td>{[s.country, s.language].filter(Boolean).join(" · ") || "—"}</td>
                    <td><SourceStatus id={s.id} status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
