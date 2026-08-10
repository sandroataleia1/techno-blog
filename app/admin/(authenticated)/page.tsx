import Link from "next/link";
import {adminDashboardStats} from "@/lib/db";
import {IconArrowRight} from "@/components/icons";

export const dynamic = "force-dynamic";

export default function AdminDashboard() {
  const s = adminDashboardStats();
  return (
    <>
      <div className="admin-topbar">
        <h1>Visão geral</h1>
      </div>
      <div className="admin-content">
        <div className="admin-stats">
          <div className="admin-stat">
            <div className="value">{s.totalProducts}</div>
            <div className="label">Produtos no catálogo</div>
          </div>
          <div className="admin-stat">
            <div className="value">{s.activeProducts}</div>
            <div className="label">Publicados/ativos</div>
          </div>
          <div className="admin-stat">
            <div className="value">{s.draftProducts}</div>
            <div className="label">Em rascunho</div>
          </div>
          <div className="admin-stat">
            <div className="value">{s.archivedProducts}</div>
            <div className="label">Arquivados</div>
          </div>
          <div className="admin-stat">
            <div className="value">{s.totalBrands}</div>
            <div className="label">Marcas ativas</div>
          </div>
          <div className="admin-stat">
            <div className="value">{s.totalCategories}</div>
            <div className="label">Categorias ativas</div>
          </div>
          <div className={`admin-stat${s.productsWithoutSource ? " is-flag" : ""}`}>
            <div className="value">{s.productsWithoutSource}</div>
            <div className="label">Produtos sem fonte oficial</div>
          </div>
          <div className={`admin-stat${s.productsWithoutSpecs ? " is-flag" : ""}`}>
            <div className="value">{s.productsWithoutSpecs}</div>
            <div className="label">Produtos sem especificações</div>
          </div>
          <div className={`admin-stat${s.productsWithoutOffer ? " is-flag" : ""}`}>
            <div className="value">{s.productsWithoutOffer}</div>
            <div className="label">Produtos sem oferta de afiliado ativa</div>
          </div>
        </div>

        <div className="admin-shortcuts">
          <Link className="cta" href="/admin/produtos/novo">Novo produto</Link>
          <Link className="cta alt" href="/admin/produtos">Produtos <IconArrowRight /></Link>
          <Link className="cta alt" href="/admin/marcas">Marcas <IconArrowRight /></Link>
          <Link className="cta alt" href="/admin/categorias">Categorias <IconArrowRight /></Link>
        </div>
      </div>
    </>
  );
}
