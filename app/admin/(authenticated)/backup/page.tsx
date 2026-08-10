import {listBackups} from "@/lib/backups";

export const dynamic = "force-dynamic";

export default async function Backup() {
  const backups = listBackups();
  return (
    <>
      <div className="admin-topbar">
        <h1>Backups</h1>
      </div>
      <div className="admin-content">
        <p className="small">Os backups consistentes ficam no volume persistente. Guarde cópias baixadas com segurança.</p>
        <form action="/api/admin/backups" method="post">
          <button className="cta" type="submit">Gerar backup</button>
        </form>
        <div className="admin-card" style={{marginTop: "1.4rem"}}>
          <h2>Backups locais</h2>
          {backups.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Arquivo</th><th className="is-numeric">Tamanho</th><th>Criado em</th></tr></thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.name}>
                      <td><a className="admin-row-link" href={`/api/admin/backups/${b.name}`}>{b.name}</a></td>
                      <td className="is-numeric">{b.size} bytes</td>
                      <td>{b.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small">Nenhum backup gerado.</p>
          )}
        </div>
      </div>
    </>
  );
}
