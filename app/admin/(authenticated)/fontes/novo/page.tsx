import {SourceForm} from "@/components/admin/source-form";
import {listBrands} from "@/lib/brands";
import {adminListProducts} from "@/lib/db";

export const dynamic = "force-dynamic";

export default function NewSource() {
  const brands = listBrands().filter((b) => b.is_active);
  const products = adminListProducts();
  return <SourceForm brands={brands} products={products} />;
}
