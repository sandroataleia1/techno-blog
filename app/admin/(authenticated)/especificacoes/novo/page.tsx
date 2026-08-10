import {SpecificationForm} from "@/components/admin/specification-form";
import {listCategories} from "@/lib/categories";

export const dynamic = "force-dynamic";

export default function NewSpecification() {
  const categories = listCategories().filter((c) => c.is_active);
  return <SpecificationForm categories={categories} />;
}
