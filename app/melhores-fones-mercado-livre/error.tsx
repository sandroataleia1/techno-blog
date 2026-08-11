"use client";
import Link from "next/link";
import {Footer, Header} from "@/components";

// Scoped to this route segment only. Deliberately ignores the caught
// Error's own .message/.digest — the page component that throws into this
// boundary already guarantees a safe generic message (see
// app/melhores-fones-mercado-livre/page.tsx), but this component never
// relies on that guarantee holding forever: it always renders its own
// fixed, safe copy, so nothing internal can ever surface here even if a
// future throw site forgets to sanitize its message.
export default function RankingError() {
  return (
    <>
      <Header />
      <main id="conteudo" className="article">
        <div className="shell">
          <p className="eyebrow">Indisponível no momento</p>
          <h1>Não foi possível carregar este ranking agora</h1>
          <p className="lead">Estamos revisando o conteúdo deste comparativo. Tente novamente em instantes.</p>
          <Link className="cta" href="/">Voltar para a página inicial</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
