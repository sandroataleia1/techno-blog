import {RankingForm} from "@/components/admin/ranking-form";
import {listCategories} from "@/lib/categories";
import {listProducts} from "@/lib/db";

export const dynamic = "force-dynamic";

export default function NewRanking() {
  const categories = listCategories().filter((c) => c.is_active);
  const products = listProducts().map((p) => ({id: p.id, name: p.name, status: p.status, is_active: p.is_active}));
  return <RankingForm categories={categories} products={products} />;
}
