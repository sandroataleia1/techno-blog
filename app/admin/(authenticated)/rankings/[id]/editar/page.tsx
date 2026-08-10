import {notFound} from "next/navigation";
import {RankingForm} from "@/components/admin/ranking-form";
import {listCategories} from "@/lib/categories";
import {listProducts} from "@/lib/db";
import {itemsForRanking, rankingById} from "@/lib/rankings";

export const dynamic = "force-dynamic";

export default async function EditRanking({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const ranking = rankingById(id);
  if (!ranking) notFound();
  const categories = listCategories().filter((c) => c.is_active || c.id === ranking.category_id);
  const products = listProducts().map((p) => ({id: p.id, name: p.name, status: p.status, is_active: p.is_active}));
  const existingItems = itemsForRanking(id);
  return <RankingForm ranking={ranking} categories={categories} products={products} existingItems={existingItems} />;
}
