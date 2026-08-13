import {ImageResponse} from "next/og";
export const size = {width: 64, height: 64};
export const contentType = "image/png";
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{width: "100%", height: "100%", background: "#0d1b32", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", fontWeight: 700, fontSize: 40, color: "#14b8c4"}}>
        T
      </div>
    ),
    size
  );
}
