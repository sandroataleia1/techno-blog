import Link from "next/link";
import {adminListProducts} from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {draft: "Rascunho", published: "Publicado", archived: "Arquivado"};
const STATUS_BADGE: Record<string, string> = {draft: "badge-neutral", published: "badge-positive", archived: "badge-muted"};

export default function AdminProducts() {
  const items = adminListProducts();
  return (
    <>
      <div className="admin-topbar">
        <h1>Produtos</h1>
        <div className="admin-topbar-actions">
          <Link className="cta" href="/admin/produtos/novo">Novo produto</Link>
        </div>
      </div>
      <div className="admin-content">
        {items.length === 0 ? (
          <div className="admin-empty">
            <p>Nenhum produto cadastrado ainda.</p>
            <Link className="cta" href="/admin/produtos/novo">Cadastrar primeiro produto</Link>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Marca</th>
                  <th>Modelo</th>
                  <th>Categoria</th>
                  <th>Status</th>
                  <th>Fonte oficial</th>
                  <th>Especificações</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td><Link className="admin-row-link" href={`/admin/produtos/${p.id}/editar`}>{p.name}</Link></td>
                    <td>{p.brand_name ?? <span className="hint">{p.brand} (legado)</span>}</td>
                    <td>{p.model ?? "—"}</td>
                    <td>{p.category_name ?? "—"}</td>
                    <td><span className={`badge ${STATUS_BADGE[p.status] ?? "badge-neutral"}`}>{STATUS_LABEL[p.status] ?? p.status}</span></td>
                    <td>{p.source_count > 0 ? <span className="badge badge-positive">{p.source_count}</span> : <span className="badge badge-warning">Nenhuma</span>}</td>
                    <td className="is-numeric">{p.spec_count}</td>
                    <td><Link className="admin-row-link" href={`/admin/produtos/${p.id}/editar`}>Editar</Link></td>
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
