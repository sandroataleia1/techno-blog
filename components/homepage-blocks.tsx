import Image from "next/image";
import type {CSSProperties} from "react";
import type {PublicHomepageBlock} from "@/lib/public-homepage-blocks";
import {externalProps} from "@/lib/site";

// Renders whatever the admin has published under /admin/blocos — a
// category-agnostic image+text+link grid, not hardcoded to any single
// product line. Each block's column count is admin-chosen (1-6) and applied
// as a CSS custom property so a single .block-grid rule covers every count;
// see the "Homepage content blocks" section in globals.css for the
// responsive collapse at narrower widths.
export function HomepageBlocks({blocks}: {blocks: PublicHomepageBlock[]}) {
  if (blocks.length === 0) return null;
  return (
    <>
      {blocks.map((b) => (
        <section key={b.id} className="block-section">
          <div className="shell">
            <div className="section-head"><div><h2>{b.title}</h2></div></div>
            <div className="block-grid" style={{"--block-cols": b.columns} as CSSProperties}>
              {b.items.map((item, i) => (
                // Every item.linkUrl is either a site-relative path or an
                // https URL (isValidLinkUrl in lib/homepage-blocks-rules.ts
                // never allows anything else) — relative stays in the same
                // tab, external follows the site-wide externalProps
                // convention (lib/site.ts), same as every affiliate/share
                // link elsewhere on the site.
                <a key={i} className="block-card" href={item.linkUrl} {...(item.linkUrl.startsWith("/") ? {} : externalProps)}>
                  {item.imageUrl && (
                    <span className="block-card-media">
                      <Image src={item.imageUrl} alt={item.text ?? b.title} fill sizes="(max-width: 560px) 100vw, (max-width: 900px) 50vw, 33vw" className="block-card-image" />
                    </span>
                  )}
                  {item.text && <span className="block-card-text">{item.text}</span>}
                </a>
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
