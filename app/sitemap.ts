import type {MetadataRoute} from "next";
import {site} from "@/lib/site";
import {publicProducts} from "@/lib/public-products";
import {publicRankingBySlug} from "@/lib/public-rankings";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const fixed = ["", "/sobre", "/privacidade", "/cookies", "/termos", "/politica-editorial", "/politica-de-correcoes", "/divulgacao-afiliados"];
  const ranking = publicRankingBySlug("melhores-fones-mercado-livre");
  // Only a fully valid, published ranking gets a sitemap entry — draft,
  // archived and "published but invalid" all mean the URL currently
  // doesn't show real Top 10 content (404, tombstone, or a generic error
  // page respectively), so none of those are worth indexing.
  const rankingEntry = ranking.kind === "ok" ? [{url: `${site.url}/melhores-fones-mercado-livre`, lastModified: new Date(ranking.ranking.updatedAt)}] : [];
  return [
    ...fixed.map((url) => ({url: `${site.url}${url}`, lastModified: new Date("2026-08-09")})),
    ...rankingEntry,
    ...publicProducts().map((p) => ({url: `${site.url}/fones/${p.slug}`, lastModified: new Date(p.updatedAt)})),
  ];
}
