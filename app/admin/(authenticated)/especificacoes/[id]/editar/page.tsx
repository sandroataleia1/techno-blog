import {notFound} from "next/navigation";
import {SpecificationForm} from "@/components/admin/specification-form";
import {specDefinitionById} from "@/lib/specifications";
import {listCategories} from "@/lib/categories";

export const dynamic = "force-dynamic";

export default async function EditSpecification({params}: {params: Promise<{id: string}>}) {
  const definition = specDefinitionById((await params).id);
  if (!definition) notFound();
  const categories = listCategories();
  return <SpecificationForm definition={definition} categories={categories} />;
}
