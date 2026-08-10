import {OfferForm} from "@/components/admin/offer-form";
import {listProducts} from "@/lib/db";

export const dynamic = "force-dynamic";

export default function NewOffer() {
  const products = listProducts().map((p) => ({id: p.id, name: p.name}));
  return <OfferForm products={products} />;
}
