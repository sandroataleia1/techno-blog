import {Footer, Header} from "@/components";
import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {site} from "@/lib/site";

// Every paragraph here describes only what the site actually does today —
// no invented company, CNPJ, address, analytics tool, newsletter service or
// contact channel. Where something legitimate depends on the site owner
// (a registered company, a real contact address, a legal review), it's
// left out entirely rather than faked — see the session report for the
// exact list of what still needs to be supplied before launch.
const content: Record<string, {title: string; body: string[]}> = {
  sobre: {
    title: `Sobre o ${site.name}`,
    body: [
      `O ${site.name} publica comparativos editoriais de tecnologia para ajudar na decisão de compra. Hoje, nosso comparativo completo cobre fones de ouvido; novas categorias serão publicadas conforme forem avaliadas com o mesmo critério.`,
      "Não afirmamos testes físicos, preços, descontos ou avaliações que não possam ser comprovados. Os critérios e fontes usados em cada guia ficam explícitos.",
    ],
  },
  contato: {
    title: "Contato",
    body: site.contact.email
      ? [`Você pode entrar em contato pelo e-mail ${site.contact.email}.`]
      : [
          "Ainda não há um canal de contato direto disponível nesta página.",
          "Consulte a Política Editorial para saber como o conteúdo é produzido e revisado.",
        ],
  },
  privacidade: {
    title: "Política de Privacidade",
    body: [
      `Esta política descreve como o ${site.name} trata informações de quem visita o site.`,
      "Atualmente, o site não utiliza cookies de rastreamento, pixels ou ferramentas de analytics para visitantes, e não coletamos dados pessoais além do que é tecnicamente necessário para entregar as páginas solicitadas, como registros padrão de acesso mantidos pela infraestrutura de hospedagem.",
      "Alguns links de produtos são de afiliados — veja a Divulgação de Afiliados para detalhes.",
      "Se o site passar a usar cookies, formulários ou ferramentas de terceiros que tratem dados pessoais, esta política será atualizada antes dessa mudança entrar em vigor.",
    ],
  },
  cookies: {
    title: "Política de Cookies",
    body: [
      `O ${site.name} não define cookies de rastreamento, publicidade ou analytics para visitantes.`,
      "O único cookie usado no site é técnico, restrito à área administrativa interna, e não afeta nem identifica visitantes públicos.",
      "Se isso mudar — por exemplo, com a adoção de uma ferramenta de analytics — esta página será atualizada antes da mudança entrar em vigor.",
    ],
  },
  termos: {
    title: "Termos de Uso",
    body: [
      `O conteúdo do ${site.name} tem caráter informativo e editorial, destinado a ajudar na comparação de produtos de tecnologia.`,
      "As informações técnicas apresentadas são baseadas em especificações divulgadas pelos fabricantes ou vendedores e podem mudar sem aviso prévio nas páginas originais dos produtos — sempre confirme preço, disponibilidade e especificações diretamente no site do vendedor antes de comprar.",
      "O uso do site é gratuito e não exige cadastro. Não nos responsabilizamos por decisões de compra tomadas exclusivamente com base neste conteúdo, nem pela disponibilidade, preço ou atendimento dos sites de terceiros para os quais linkamos.",
    ],
  },
  "politica-editorial": {
    title: "Política Editorial",
    body: [
      "Priorizamos clareza, atualização e separação entre informações do fabricante e avaliação editorial. Links comerciais não determinam recomendações.",
      "Correções relevantes, fontes e mudanças de posição devem ser registradas na página revisada.",
    ],
  },
  "divulgacao-afiliados": {
    title: "Divulgação de Afiliados",
    body: [
      `Alguns links podem gerar comissão para o ${site.name} sem custo adicional ao visitante. A comissão não altera o preço pago pelo consumidor.`,
      "Não usamos promessa de estoque, preço, desconto ou escassez sem confirmação verificável.",
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(content).map((page) => ({page}));
}

export async function generateMetadata({params}: {params: Promise<{page: string}>}): Promise<Metadata> {
  const {page} = await params;
  const item = content[page];
  return item
    ? {title: item.title, description: item.body[0].slice(0, 155), alternates: {canonical: `/${page}`}, robots: page === "contato" ? {index: false, follow: true} : undefined}
    : {};
}

export default async function Legal({params}: {params: Promise<{page: string}>}) {
  const {page} = await params;
  const item = content[page];
  if (!item) notFound();
  return (
    <>
      <Header />
      <main id="conteudo" className="article">
        <div className="shell">
          <p className="breadcrumbs">Início / {item.title}</p>
          <h1>{item.title}</h1>
          <div className="card">
            {item.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
