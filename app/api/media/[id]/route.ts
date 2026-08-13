import {adminSession} from "@/lib/admin";
import {mediaAssetForAdmin, mediaAssetIfPublished, type StoredMedia} from "@/lib/media";

export const dynamic = "force-dynamic";

function serve(asset: StoredMedia, cacheControl: string) {
  return new Response(new Uint8Array(asset.data), {
    headers: {"Content-Type": asset.mime_type, "Cache-Control": cacheControl, "X-Content-Type-Options": "nosniff"},
  });
}

// Anonymous callers only ever see media referenced by a *published*
// homepage block — draft/archived blocks and unreferenced uploads (see the
// orphan-media tech debt note in lib/homepage-blocks.ts) 404, same as an id
// that doesn't exist at all, so there's no way to distinguish "not found"
// from "not published yet" from the response. An authenticated admin session
// bypasses that gate entirely (so the editor can preview an upload before
// the block is saved), and always gets a private/no-store response so a
// shared/CDN cache never learns of unpublished content through an admin's
// own request.
export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  const id = (await params).id;

  if (await adminSession()) {
    const asset = mediaAssetForAdmin(id);
    if (!asset) return new Response(null, {status: 404});
    return serve(asset, "private, no-store");
  }

  const asset = mediaAssetIfPublished(id);
  if (!asset) return new Response(null, {status: 404});
  return serve(asset, "public, max-age=86400, immutable");
}
