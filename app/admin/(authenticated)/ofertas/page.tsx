import Link from "next/link";
import {listOffers} from "@/lib/offers";
import {OfferStatusToggle} from "@/components/admin/offer-status";

export const dynamic = "force-dynamic";

const currency = new Intl.NumberFormat("pt-BR", {style: "currency", currency: "BRL"});
const dateFormat = new Intl.DateTimeFormat("pt-BR", {dateStyle: "short"});

export default function AdminOffers() {
  const offers = listOffers();
  return (
    <>
      <div className="admin-topbar">
        <h1>Ofertas</h1>
        <div className="admin-topbar-actions">
          <Link className="cta" href="/admin/ofertas/novo">Nova oferta</Link>
        </div>
      </div>
      <div className="admin-content">
        <p className="small" style={{marginTop: 0}}>Cadastro manual de links afiliados do Mercado Livre. Nenhum preço é coletado automaticamente — informe apenas o que foi conferido manualmente.</p>
        {offers.length === 0 ? (
          <div className="admin-empty">
            <p>Nenhuma oferta cadastrada ainda.</p>
            <Link className="cta" href="/admin/ofertas/novo">Cadastrar primeira oferta</Link>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Marketplace</th>
                  <th>Status</th>
                  <th>Principal</th>
                  <th>Preço atual</th>
                  <th>Última verificação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id}>
                    <td><Link className="admin-row-link" href={`/admin/ofertas/${o.id}/editar`}>{o.product_name}</Link></td>
                    <td>{o.retailer}</td>
                    <td><OfferStatusToggle offer={o} /></td>
                    <td>{o.is_primary ? <span className="badge badge-positive">Principal</span> : <span className="badge badge-neutral">—</span>}</td>
                    <td className="is-numeric">{o.current_price_cents != null ? currency.format(o.current_price_cents / 100) : "—"}</td>
                    <td>{o.last_checked_at ? dateFormat.format(new Date(o.last_checked_at)) : "Nunca verificado"}</td>
                    <td><Link className="admin-row-link" href={`/admin/ofertas/${o.id}/editar`}>Editar</Link></td>
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
