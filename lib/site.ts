const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
// Set NEXT_PUBLIC_SITE_URL to the real canonical domain before publishing.
// Central brand identity. Every SEO surface (layout, manifest, icon, opengraph-image)
// and every user-facing brand string should read from here instead of a literal name,
// so a future rebrand only touches this file.
export const site = {
  name: "Techno Blog",
  slogan: "Comparativos claros para escolher tecnologia melhor.",
  description: "Rankings, comparativos e fichas técnicas para escolher smartphones, notebooks, fones e outros produtos de tecnologia com mais segurança.",
  url: configuredUrl || "https://www.technoblog-exemplo.com.br",
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
