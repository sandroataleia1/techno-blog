"use client";
import Link from "next/link";
import type {ReactNode} from "react";
import {usePathname} from "next/navigation";
import {LogoMark, Wordmark} from "@/components/brand";
import {IconArchive, IconBox, IconExternal, IconGrid, IconHome, IconLink, IconList, IconTag} from "@/components/icons";

const NAV = [
  {group: "Catálogo", items: [
    {href: "/admin", label: "Visão geral", Icon: IconHome, exact: true},
    {href: "/admin/produtos", label: "Produtos", Icon: IconBox, exact: false},
    {href: "/admin/ofertas", label: "Ofertas", Icon: IconExternal, exact: false},
    {href: "/admin/marcas", label: "Marcas", Icon: IconTag, exact: false},
    {href: "/admin/categorias", label: "Categorias", Icon: IconGrid, exact: false},
    {href: "/admin/especificacoes", label: "Especificações", Icon: IconList, exact: false},
    {href: "/admin/fontes", label: "Fontes oficiais", Icon: IconLink, exact: false},
  ]},
  {group: "Sistema", items: [
    {href: "/admin/backup", label: "Backups", Icon: IconArchive, exact: false},
  ]},
];

export function AdminShell({children}: {children: ReactNode}) {
  const pathname = usePathname();
  const isActive = (href: string, exact: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-sidebar-brand" href="/admin">
          <LogoMark tone="on-dark" size={26} />
          <Wordmark />
        </Link>
        <nav className="admin-nav" aria-label="Painel administrativo">
          {NAV.map((section) => (
            <div key={section.group}>
              <p className="admin-nav-label">{section.group}</p>
              {section.items.map(({href, label, Icon, exact}) => (
                <Link key={href} href={href} className={isActive(href, exact) ? "is-active" : ""} aria-current={isActive(href, exact) ? "page" : undefined}>
                  <Icon /> {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar-foot">
          <form action="/api/admin/logout" method="post">
            <button className="cta alt" type="submit" style={{color: "#cfd3ce"}}>Sair</button>
          </form>
        </div>
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  );
}
