import Link from "next/link";
import {listCategories} from "@/lib/categories";

export const dynamic = "force-dynamic";

export default function AdminCategories() {
  const categories = listCategories();
  return (
    <>
      <div className="admin-topbar">
        <h1>Categorias</h1>
        <div className="admin-topbar-actions">
          <Link className="cta" href="/admin/categorias/novo">Nova categoria</Link>
        </div>
      </div>
      <div className="admin-content">
        <p className="small" style={{marginTop: 0}}>Mantemos apenas categorias reais em uso. Novas categorias (celulares, informática, smart home…) devem ser criadas quando houver produtos de fato — não crie categorias vazias só para preencher o catálogo.</p>
        {categories.length === 0 ? (
          <div className="admin-empty">
            <p>Nenhuma categoria cadastrada ainda.</p>
            <Link className="cta" href="/admin/categorias/novo">Cadastrar primeira categoria</Link>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Categoria</th><th>Descrição</th><th>Status</th><th className="is-numeric">Produtos</th><th></th></tr></thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td><Link className="admin-row-link" href={`/admin/categorias/${c.id}/editar`}>{c.name}</Link></td>
                    <td>{c.description ?? "—"}</td>
                    <td><span className={`badge ${c.is_active ? "badge-positive" : "badge-neutral"}`}>{c.is_active ? "Ativa" : "Inativa"}</span></td>
                    <td className="is-numeric">{c.product_count}</td>
                    <td><Link className="admin-row-link" href={`/admin/categorias/${c.id}/editar`}>Editar</Link></td>
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
