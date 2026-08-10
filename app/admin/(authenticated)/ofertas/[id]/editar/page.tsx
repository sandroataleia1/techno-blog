import {notFound} from "next/navigation";
import {OfferForm} from "@/components/admin/offer-form";
import {offerById} from "@/lib/offers";
import {listProducts} from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function EditOffer({params}: {params: Promise<{id: string}>}) {
  const offer = offerById((await params).id);
  if (!offer) notFound();
  const products = listProducts().map((p) => ({id: p.id, name: p.name}));
  return <OfferForm offer={offer} products={products} />;
}
