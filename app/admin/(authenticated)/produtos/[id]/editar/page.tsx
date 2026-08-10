import {notFound} from "next/navigation";
import {ProductForm} from "@/components/admin/product-form";
import {productById} from "@/lib/db";
import {listBrands} from "@/lib/brands";
import {listCategories} from "@/lib/categories";
import {listSpecDefinitions, specificationsForProduct} from "@/lib/specifications";
import {sourcesForProduct} from "@/lib/sources";

export const dynamic = "force-dynamic";

export default async function EditProduct({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const product = productById(id);
  if (!product) notFound();
  const brands = listBrands().filter((b) => b.is_active || b.id === product.brand_id);
  const categories = listCategories().filter((c) => c.is_active || c.id === product.category_id);
  const specDefinitions = listSpecDefinitions();
  const existingSpecs = specificationsForProduct(id);
  const existingSources = sourcesForProduct(id);
  return (
    <ProductForm
      mode="edit"
      product={product}
      brands={brands}
      categories={categories}
      specDefinitions={specDefinitions}
      existingSpecs={existingSpecs}
      existingSources={existingSources}
    />
  );
}
