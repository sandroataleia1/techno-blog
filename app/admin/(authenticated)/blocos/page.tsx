import Link from "next/link";
import {listHomepageBlocks} from "@/lib/homepage-blocks";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {draft: "Rascunho", published: "Publicado", archived: "Arquivado"};
const statusBadge: Record<string, string> = {draft: "badge-neutral", published: "badge-positive", archived: "badge-muted"};
const contentModeLabel: Record<string, string> = {photo: "Foto", text: "Texto", both: "Foto + texto"};
const dateFormat = new Intl.DateTimeFormat("pt-BR", {dateStyle: "short"});

export default function AdminHomepageBlocks() {
  const blocks = listHomepageBlocks();
  return (
    <>
      <div className="admin-topbar">
        <h1>Blocos da home</h1>
        <div className="admin-topbar-actions">
          <Link className="cta" href="/admin/blocos/novo">Novo bloco</Link>
        </div>
      </div>
      <div className="admin-content">
        <p className="small" style={{marginTop: 0}}>Seções configuráveis exibidas abaixo do carrossel na home, em ordem. Cada bloco vira uma grade de cards com imagem, texto ou ambos, e um link por item.</p>
        {blocks.length === 0 ? (
          <div className="admin-empty">
            <p>Nenhum bloco cadastrado ainda.</p>
            <Link className="cta" href="/admin/blocos/novo">Criar primeiro bloco</Link>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Conteúdo</th>
                  <th className="is-numeric">Colunas</th>
                  <th>Status</th>
                  <th className="is-numeric">Itens</th>
                  <th>Atualizado em</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => (
                  <tr key={b.id}>
                    <td><Link className="admin-row-link" href={`/admin/blocos/${b.id}/editar`}>{b.title}</Link></td>
                    <td>{contentModeLabel[b.content_mode]}</td>
                    <td className="is-numeric">{b.columns}</td>
                    <td><span className={`badge ${statusBadge[b.status]}`}>{statusLabel[b.status]}</span></td>
                    <td className="is-numeric">{b.item_count}</td>
                    <td>{b.updated_at ? dateFormat.format(new Date(b.updated_at)) : "—"}</td>
                    <td><Link className="admin-row-link" href={`/admin/blocos/${b.id}/editar`}>Editar</Link></td>
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
