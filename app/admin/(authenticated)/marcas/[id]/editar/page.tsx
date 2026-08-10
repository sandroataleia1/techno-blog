import {notFound} from "next/navigation";
import {BrandForm} from "@/components/admin/brand-form";
import {brandById} from "@/lib/brands";

export const dynamic = "force-dynamic";

export default async function EditBrand({params}: {params: Promise<{id: string}>}) {
  const brand = brandById((await params).id);
  if (!brand) notFound();
  return <BrandForm brand={brand} />;
}
