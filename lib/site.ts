const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
const PLACEHOLDER_URL = "https://www.technoblog-exemplo.com.br";
// Set NEXT_PUBLIC_SITE_URL to the real canonical domain before publishing —
// without it, every canonical link, sitemap entry, JSON-LD id and Open Graph
// URL silently points at the placeholder domain above. This can't be thrown
// as a hard build/runtime error: `next build` and every local dev/test run
// in this project also runs with NODE_ENV=production and no real domain
// configured, so a throw here would break normal local workflows, not just
// a genuine unconfigured production deploy. A loud, impossible-to-miss
// startup warning is the safeguard instead — see server.js/instrumentation
// equivalents in other Next apps; here it just runs at module load, which
// happens once per server process.
if (process.env.NODE_ENV === "production" && !configuredUrl) {
  console.warn(
    "\n⚠️  NEXT_PUBLIC_SITE_URL não está configurado. " +
      `O site está servindo com o domínio de placeholder "${PLACEHOLDER_URL}" ` +
      "em canonical, sitemap, JSON-LD e Open Graph. Configure a variável de " +
      "ambiente NEXT_PUBLIC_SITE_URL com o domínio real antes do lançamento.\n"
  );
}
// Central brand identity. Every SEO surface (layout, manifest, icon, opengraph-image)
// and every user-facing brand string should read from here instead of a literal name,
// so a future rebrand only touches this file.
export const site = {
  name: "Techno Blog",
  slogan: "Comparativos claros para escolher tecnologia melhor.",
  description: "Rankings, comparativos e fichas técnicas para escolher smartphones, notebooks, fones e outros produtos de tecnologia com mais segurança.",
  url: configuredUrl || PLACEHOLDER_URL,
  logo: "/icon",
  ogImage: "/opengraph-image",
  affiliateDisclosure: "Alguns links podem ser de afiliado. Se você comprar por eles, podemos receber uma comissão sem custo adicional para você.",
  author: { name: process.env.NEXT_PUBLIC_AUTHOR_NAME || "Equipe editorial a definir", url: process.env.NEXT_PUBLIC_AUTHOR_URL || "" },
  contact: { email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "" },
  social: {
    instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM || "",
    youtube: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE || "",
    twitter: process.env.NEXT_PUBLIC_SOCIAL_TWITTER || "",
    facebook: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK || "",
    tiktok: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK || "",
  },
};
export const externalProps = { target: "_blank", rel: "sponsored nofollow noopener" } as const;
export const absoluteUrl = (path = "/") => new URL(path, `${site.url}/`).toString();
