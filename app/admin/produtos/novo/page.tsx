import {redirect} from "next/navigation"; import {adminSession} from "@/lib/admin"; import {ProductForm} from "@/components/admin-form";
export default async function New(){if(!await adminSession())redirect("/admin/login");return <ProductForm/>}
