import {notFound} from "next/navigation";
import {HomepageBlockForm} from "@/components/admin/homepage-block-form";
import {homepageBlockById, itemsForBlock} from "@/lib/homepage-blocks";

export const dynamic = "force-dynamic";

export default async function EditHomepageBlock({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const block = homepageBlockById(id);
  if (!block) notFound();
  const existingItems = itemsForBlock(id);
  return <HomepageBlockForm block={block} existingItems={existingItems} />;
}
