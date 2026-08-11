import Link from "next/link";
import {listRankings} from "@/lib/rankings";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {draft: "Rascunho", published: "Publicado", archived: "Arquivado"};
const statusBadge: Record<string, string> = {draft: "badge-neutral", published: "badge-positive", archived: "badge-muted"};
const dateFormat = new Intl.DateTimeFormat("pt-BR", {dateStyle: "short"});

export default function AdminRankings() {
  const rankings = listRankings();
  return (
    <>
      <div className="admin-topbar">
        <h1>Rankings</h1>
        <div className="admin-topbar-actions">
          <Link className="cta" href="/admin/rankings/novo">Novo ranking</Link>
        </div>
      </div>
      <div className="admin-content">
        <p className="small" style={{marginTop: 0}}>Rankings Top 10 organizados manualmente a partir do catálogo. Publicar exige exatamente 10 produtos com todo o conteúdo editorial preenchido.</p>
        {rankings.length === 0 ? (
          <div className="admin-empty">
            <p>Nenhum ranking cadastrado ainda.</p>
            <Link className="cta" href="/admin/rankings/novo">Criar primeiro ranking</Link>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Categoria</th>
                  <th>Status</th>
                  <th className="is-numeric">Produtos</th>
                  <th>Publicado em</th>
                  <th>Atualizado em</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r) => (
                  <tr key={r.id}>
                    <td><Link className="admin-row-link" href={`/admin/rankings/${r.id}/editar`}>{r.title}</Link></td>
                    <td>{r.category_name ?? "—"}</td>
                    <td><span className={`badge ${statusBadge[r.status]}`}>{statusLabel[r.status]}</span></td>
                    <td className="is-numeric">{r.item_count}/10</td>
                    <td>{r.published_at ? dateFormat.format(new Date(r.published_at)) : "—"}</td>
                    <td>{r.updated_at ? dateFormat.format(new Date(r.updated_at)) : "—"}</td>
                    <td><Link className="admin-row-link" href={`/admin/rankings/${r.id}/editar`}>Editar</Link></td>
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
