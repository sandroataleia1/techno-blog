import {ImageResponse} from "next/og";
import {site} from "@/lib/site";
export const alt = `${site.name} — ${site.slogan}`;
export const size = {width: 1200, height: 630};
export const contentType = "image/png";

const WAVE = [22, 48, 30, 66, 40, 82, 55, 34, 70, 46, 90, 58, 26, 74, 42, 60, 20, 50, 36, 64, 28, 78, 44, 32, 68, 24];

export default function Image() {
  return new ImageResponse(
    (
      <div style={{background: "#0b0f14", height: "100%", width: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", color: "#f5f2ea"}}>
        <div style={{display: "flex", alignItems: "center", gap: 14}}>
          <div style={{width: 34, height: 34, border: "4px solid #8b5cf6", display: "flex"}} />
          <div style={{display: "flex", flexDirection: "column", lineHeight: 1, fontWeight: 700, letterSpacing: -1, textTransform: "uppercase"}}>
            <span style={{fontSize: 22}}>Techno</span>
            <span style={{fontSize: 16, color: "#98a1ad"}}>Blog</span>
          </div>
        </div>
        <div style={{display: "flex", flexDirection: "column"}}>
          <span style={{fontSize: 26, color: "#8b5cf6", fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, marginBottom: 16}}>Guia de compra 2026</span>
          <span style={{fontSize: 62, lineHeight: 1.08, fontWeight: 700, maxWidth: 980}}>Comparativos claros para escolher tecnologia melhor.</span>
          <span style={{fontSize: 26, color: "#cfd3ce", marginTop: 22, maxWidth: 820}}>Rankings, comparativos e fichas técnicas de smartphones, notebooks, fones e outros produtos de tecnologia.</span>
        </div>
        <div style={{display: "flex", alignItems: "flex-end", gap: 5, height: 46}}>
          {WAVE.map((h, i) => (
            <div key={i} style={{width: 8, height: Math.round(h * 0.5), background: "rgba(139,92,246,0.6)", borderRadius: 4}} />
          ))}
        </div>
      </div>
    ),
    size
  );
}
