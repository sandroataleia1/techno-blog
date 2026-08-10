import {redirect} from "next/navigation";
import type {ReactNode} from "react";
import {adminSession} from "@/lib/admin";
import {AdminShell} from "@/components/admin/shell";

export default async function AuthenticatedAdminLayout({children}: {children: ReactNode}) {
  if (!(await adminSession())) redirect("/admin/login");
  return <AdminShell>{children}</AdminShell>;
}
