import "server-only";
import {db} from "@/lib/db";
import {validateItemsForPublish, type HomepageBlockContentMode} from "@/lib/homepage-blocks-rules";

export type PublicHomepageBlockItem = {
  linkUrl: string;
  text: string | null;
  imageUrl: string | null;
};
export type PublicHomepageBlock = {
  id: string;
  title: string;
  contentMode: HomepageBlockContentMode;
  columns: number;
  items: PublicHomepageBlockItem[];
};

type BlockRow = {
  id: string;
  title: string;
  content_mode: HomepageBlockContentMode;
  columns: number;
  display_order: number;
  status: string;
};
type ItemRow = {
  position: number;
  image_id: string | null;
  text: string | null;
  link_url: string;
};

// Same spirit as publicRankingBySlug's validation gate: a published block
// that doesn't actually satisfy its own content_mode's requirements (e.g. a
// "photo" block with an item missing its image, corrupt data or a write
// path that skipped validation) is never rendered half-broken — it's just
// skipped, silently, the same way publicProducts() filters rather than
// throws. There's no per-block public page to 404/tombstone here, so unlike
// publicRankingBySlug there's no discriminated result — just a filtered list.
export function listPublishedHomepageBlocks(): PublicHomepageBlock[] {
  const blocks = db().prepare("SELECT * FROM homepage_blocks WHERE status='published' ORDER BY display_order, updated_at").all() as BlockRow[];
  const result: PublicHomepageBlock[] = [];

  for (const block of blocks) {
    if (!block.title?.trim()) continue;

    const items = db()
      .prepare("SELECT position, image_id, text, link_url FROM homepage_block_items WHERE block_id=? ORDER BY position")
      .all(block.id) as ItemRow[];

    const asInput = items.map((i) => ({linkUrl: i.link_url ?? "", text: i.text ?? "", imageId: i.image_id}));
    if (validateItemsForPublish(block.content_mode, asInput) !== null) continue;

    result.push({
      id: block.id,
      title: block.title,
      contentMode: block.content_mode,
      columns: block.columns,
      items: items.map((i) => ({
        linkUrl: i.link_url,
        text: i.text,
        imageUrl: i.image_id ? `/api/media/${i.image_id}` : null,
      })),
    });
  }

  return result;
}
