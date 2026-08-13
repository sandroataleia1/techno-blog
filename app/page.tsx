import {Footer, Header, HeroCarousel} from "@/components";
import {HomepageBlocks} from "@/components/homepage-blocks";
import {site} from "@/lib/site";
import {publicRankingBySlug} from "@/lib/public-rankings";
import {listPublishedHomepageBlocks} from "@/lib/public-homepage-blocks";

export const dynamic = "force-dynamic";

const FEATURED_RANKING_SLUG = "melhores-fones-mercado-livre";

export default function Home() {
  const result = publicRankingBySlug(FEATURED_RANKING_SLUG);
  const items = result.kind === "ok" ? result.items : [];
  const top3 = items.slice(0, 3);
  const blocks = listPublishedHomepageBlocks();

  return (
    <>
      <Header />
      <main id="conteudo">
        {/* The visible hero carousel intentionally carries no headline (removed
            per an earlier editorial decision) — this sr-only h1 is what keeps
            the page's real semantic heading present, regardless of whether any
            homepage block exists yet below it. */}
        <h1 className="sr-only">{site.name} — {site.slogan}</h1>
        <section className="hero">
          <HeroCarousel products={top3} />
        </section>
        <HomepageBlocks blocks={blocks} />
      </main>
      <Footer />
    </>
  );
}
