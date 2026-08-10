import Link from "next/link";
import {listBrands} from "@/lib/brands";

export const dynamic = "force-dynamic";

export default function AdminBrands() {
  const brands = listBrands();
  return (
    <>
      <div className="admin-topbar">
        <h1>Marcas</h1>
        <div className="admin-topbar-actions">
          <Link className="cta" href="/admin/marcas/novo">Nova marca</Link>
        </div>
      </div>
      <div className="admin-content">
        {brands.length === 0 ? (
          <div className="admin-empty">
            <p>Nenhuma marca cadastrada ainda.</p>
            <Link className="cta" href="/admin/marcas/novo">Cadastrar primeira marca</Link>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Marca</th><th>Site oficial</th><th>Status</th><th className="is-numeric">Produtos</th><th></th></tr></thead>
              <tbody>
                {brands.map((b) => (
                  <tr key={b.id}>
                    <td><Link className="admin-row-link" href={`/admin/marcas/${b.id}/editar`}>{b.name}</Link></td>
                    <td>{b.official_website ? <a href={b.official_website} target="_blank" rel="noopener noreferrer">{b.official_website}</a> : "—"}</td>
                    <td><span className={`badge ${b.is_active ? "badge-positive" : "badge-neutral"}`}>{b.is_active ? "Ativa" : "Inativa"}</span></td>
                    <td className="is-numeric">{b.product_count}</td>
                    <td><Link className="admin-row-link" href={`/admin/marcas/${b.id}/editar`}>Editar</Link></td>
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
