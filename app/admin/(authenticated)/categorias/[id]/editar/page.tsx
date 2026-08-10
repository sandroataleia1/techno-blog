import {notFound} from "next/navigation";
import {CategoryForm} from "@/components/admin/category-form";
import {categoryById} from "@/lib/categories";

export const dynamic = "force-dynamic";

export default async function EditCategory({params}: {params: Promise<{id: string}>}) {
  const category = categoryById((await params).id);
  if (!category) notFound();
  return <CategoryForm category={category} />;
}
