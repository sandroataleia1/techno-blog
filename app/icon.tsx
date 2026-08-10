import {ImageResponse} from "next/og";
export const size = {width: 64, height: 64};
export const contentType = "image/png";
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{width: "100%", height: "100%", background: "#0b0f14", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", fontWeight: 700, fontSize: 40, color: "#8b5cf6"}}>
        T
      </div>
    ),
    size
  );
}
