"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import type {DbAffiliateOffer} from "@/lib/offers";
import {centsToBrl} from "@/lib/offers-rules";

const LABEL: Record<string, string> = {active: "Ativa", inactive: "Inativa", broken: "Quebrada"};
const BADGE: Record<string, string> = {active: "badge-positive", inactive: "badge-neutral", broken: "badge-warning"};

export function OfferStatusToggle({offer}: {offer: DbAffiliateOffer}) {
  const router = useRouter();
  const [status, setStatus] = useState(offer.status);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = status === "active" ? "inactive" : "active";
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/offers/${offer.id}`, {
        method: "PATCH",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          productId: offer.product_id,
          retailer: offer.retailer,
          affiliateUrl: offer.affiliate_url,
          originalProductUrl: offer.original_product_url,
          status: next,
          isPrimary: Boolean(offer.is_primary),
          currentPrice: centsToBrl(offer.current_price_cents) || null,
          previousPrice: centsToBrl(offer.previous_price_cents) || null,
          lastCheckedAt: offer.last_checked_at,
          internalNote: offer.internal_note,
        }),
      });
      if (res.ok) {
        setStatus(next);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{display: "flex", alignItems: "center", gap: "0.5rem"}}>
      <span className={`badge ${BADGE[status]}`}>{LABEL[status]}</span>
      {status !== "broken" && (
        <button className="cta alt" type="button" disabled={busy} onClick={toggle}>{status === "active" ? "Desativar" : "Ativar"}</button>
      )}
    </div>
  );
}
