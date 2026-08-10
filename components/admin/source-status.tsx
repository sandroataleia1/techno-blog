"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";

const LABEL: Record<string, string> = {pending: "Pendente de revisão", approved: "Aprovada", rejected: "Rejeitada"};
const BADGE: Record<string, string> = {pending: "badge-neutral", approved: "badge-positive", rejected: "badge-muted"};

export function SourceStatus({id, status}: {id: string; status: "pending" | "approved" | "rejected"}) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [busy, setBusy] = useState(false);

  async function setStatus(next: "approved" | "rejected") {
    if (next === "rejected" && !window.confirm("Marcar esta fonte como rejeitada?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sources/${id}`, {method: "PATCH", headers: {"content-type": "application/json"}, body: JSON.stringify({status: next, notes: null})});
      if (res.ok) {
        setCurrent(next);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap"}}>
      <span className={`badge ${BADGE[current]}`}>{LABEL[current]}</span>
      {current === "pending" && (
        <>
          <button className="cta alt" type="button" disabled={busy} onClick={() => setStatus("approved")}>Aprovar</button>
          <button className="cta alt" type="button" disabled={busy} onClick={() => setStatus("rejected")}>Rejeitar</button>
        </>
      )}
    </div>
  );
}
