const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
// Set NEXT_PUBLIC_SITE_URL to the real canonical domain before publishing.
export const site = { name: "Guia do Fone", url: configuredUrl || "https://www.guiadofone.com.br", description: "Comparativos editoriais claros para escolher fones de ouvido.", affiliateDisclosure: "Alguns links podem ser de afiliado. Se você comprar por eles, podemos receber uma comissão sem custo adicional para você.", author: { name: process.env.NEXT_PUBLIC_AUTHOR_NAME || "Equipe editorial a definir", url: process.env.NEXT_PUBLIC_AUTHOR_URL || "" } };
export const externalProps = { target: "_blank", rel: "sponsored nofollow noopener" } as const;
export const absoluteUrl = (path = "/") => new URL(path, `${site.url}/`).toString();
