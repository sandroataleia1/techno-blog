import Link from "next/link";
import {listSpecDefinitions} from "@/lib/specifications";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {text: "Texto", number: "Número", boolean: "Sim/Não"};

export default function AdminSpecifications() {
  const defs = listSpecDefinitions();
  const byCategory = new Map<string, typeof defs>();
  for (const d of defs) {
    const list = byCategory.get(d.category_name) ?? [];
    list.push(d);
    byCategory.set(d.category_name, list);
  }
  return (
    <>
      <div className="admin-topbar">
        <h1>Definições de especificações</h1>
        <div className="admin-topbar-actions">
          <Link className="cta" href="/admin/especificacoes/novo">Nova especificação</Link>
        </div>
      </div>
      <div className="admin-content">
        {defs.length === 0 ? (
          <div className="admin-empty">
            <p>Nenhuma especificação definida ainda.</p>
            <Link className="cta" href="/admin/especificacoes/novo">Criar primeira especificação</Link>
          </div>
        ) : (
          [...byCategory.entries()].map(([categoryName, items]) => (
            <div className="admin-card" key={categoryName}>
              <h2>{categoryName}</h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Rótulo</th><th>Chave</th><th>Tipo</th><th>Unidade</th><th>Ficha rápida</th><th></th></tr></thead>
                  <tbody>
                    {items.map((d) => (
                      <tr key={d.id}>
                        <td><Link className="admin-row-link" href={`/admin/especificacoes/${d.id}/editar`}>{d.label}</Link></td>
                        <td>{d.key}</td>
                        <td>{TYPE_LABEL[d.data_type]}</td>
                        <td>{d.unit ?? "—"}</td>
                        <td>{d.is_key_specification ? <span className="badge badge-positive">Sim</span> : <span className="badge badge-neutral">Não</span>}</td>
                        <td><Link className="admin-row-link" href={`/admin/especificacoes/${d.id}/editar`}>Editar</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
