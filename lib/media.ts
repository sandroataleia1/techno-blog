import "server-only";
import crypto from "node:crypto";
import {db} from "@/lib/db";
import {processImage} from "@/lib/images";

export type MediaSourceType = "original_illustration" | "brand_provided" | "affiliate_program" | "licensed" | "official_authorized";

// Dedupes by hash, same convention as saveImage() in lib/images.ts — but
// writes to media_assets, the generic asset table (not tied to any single
// parent row like product_images is to products).
export function saveMediaAsset(image: Awaited<ReturnType<typeof processImage>>, sourceType: MediaSourceType = "original_illustration"): string {
  const existing = db().prepare("SELECT id FROM media_assets WHERE hash=?").get(image.hash) as {id: string} | undefined;
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db()
    .prepare(
      "INSERT INTO media_assets (id,original_name,mime_type,width,height,size,hash,data,source_type,source_note,license,origin_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    )
    .run(id, image.originalName, image.mimeType, image.width, image.height, image.size, image.hash, image.data, sourceType, null, null, null, now, now);
  return id;
}

export type StoredMedia = {mime_type: string; data: Buffer};

// Any admin with a valid session can inspect any media asset that exists —
// including one uploaded for a draft/archived block, or one not (yet)
// referenced by anything — so the editor can preview what it just uploaded
// before the block is saved. Never exposed to anonymous callers; the route
// gates this behind adminSession() and serves it with a private/no-store
// Cache-Control, so a shared/CDN cache never learns of unpublished content.
export function mediaAssetForAdmin(id: string): StoredMedia | undefined {
  return db().prepare("SELECT mime_type, data FROM media_assets WHERE id=?").get(id) as StoredMedia | undefined;
}

// Gate for anonymous access: a media asset is only publicly reachable while
// it's actually referenced by an item belonging to a *published* homepage
// block — the same condition listPublishedHomepageBlocks() uses to decide
// whether to expose the URL in the first place. A draft/archived block, or
// an id with no reference at all (e.g. uploaded then abandoned — see the
// orphan-media tech debt note in lib/homepage-blocks.ts), is invisible to
// anonymous callers even though the row still exists. LIMIT 1 is enough:
// the same media can legitimately be referenced by more than one item/block
// (saveMediaAsset dedupes by hash), and this only needs one of them to be
// published to justify public access — it never deletes or favors any one
// reference, so sharing is unaffected.
export function mediaAssetIfPublished(id: string): StoredMedia | undefined {
  return db()
    .prepare(
      `SELECT ma.mime_type, ma.data
       FROM media_assets ma
       JOIN homepage_block_items hbi ON hbi.image_id = ma.id
       JOIN homepage_blocks hb ON hb.id = hbi.block_id
       WHERE ma.id = ? AND hb.status = 'published'
       LIMIT 1`
    )
    .get(id) as StoredMedia | undefined;
}
