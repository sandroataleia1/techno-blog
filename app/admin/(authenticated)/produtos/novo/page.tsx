import {ProductForm} from "@/components/admin/product-form";
import {listBrands} from "@/lib/brands";
import {listCategories} from "@/lib/categories";
import {listSpecDefinitions} from "@/lib/specifications";

export const dynamic = "force-dynamic";

export default function NewProduct() {
  const brands = listBrands().filter((b) => b.is_active);
  const categories = listCategories().filter((c) => c.is_active);
  const specDefinitions = listSpecDefinitions();
  return <ProductForm mode="create" brands={brands} categories={categories} specDefinitions={specDefinitions} />;
}
