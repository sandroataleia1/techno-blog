import {NextResponse} from "next/server";
import {requireAdminMutation} from "@/lib/admin";
import {processImage} from "@/lib/images";
import {saveMediaAsset} from "@/lib/media";

// Generic upload endpoint — unlike /api/admin/products/[id]/image, this
// isn't tied to a pre-existing parent row: a homepage block item's image
// is uploaded fresh before the block itself is saved, so the client needs
// an id back immediately. Rate limiting isn't per-target-id here (there's
// no id yet); a single admin session uploading images is expected traffic,
// so this route relies on requireAdminMutation's auth/CSRF gate only.
// Same convention as every other admin route's error translation
// (translateRankingError, translateHomepageBlockError): the UNAUTHORIZED/
// FORBIDDEN control-flow markers from lib/admin.ts are internal-only and
// must never reach the client verbatim. Everything else thrown here
// (processImage's own validation errors) is already written to be public.
function translateMediaError(e: unknown): {status: number; message: string} {
  const message = e instanceof Error ? e.message : "";
  if (message === "UNAUTHORIZED") return {status: 401, message: "Não autorizado"};
  if (message === "FORBIDDEN") return {status: 403, message: "Requisição proibida"};
  return {status: 400, message: message || "Upload recusado"};
}

export async function POST(req: Request) {
  try {
    await requireAdminMutation(req);
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) throw new Error("Imagem é obrigatória.");
    const imageId = saveMediaAsset(await processImage(file));
    return NextResponse.json({id: imageId, url: `/api/media/${imageId}`}, {status: 201});
  } catch (e) {
    const {status, message} = translateMediaError(e);
    return NextResponse.json({error: message}, {status});
  }
}
