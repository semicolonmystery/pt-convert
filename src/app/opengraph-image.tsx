import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Packet Tracer Converter — client-side PKT/PKA converter";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1f1f1f 100%)",
          color: "#fafafa",
          fontFamily: "sans-serif",
          padding: 96,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 40,
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 32 32"
            width={140}
            height={140}
            fill="none"
            stroke="#fafafa"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 3 H19 L26 10 V27 a2 2 0 0 1 -2 2 H8 a2 2 0 0 1 -2 -2 V5 a2 2 0 0 1 2 -2 z" />
            <path d="M19 3 V9 a1 1 0 0 0 1 1 H26" />
            <path d="M11 16 H20" />
            <polyline points="17.5,13.5 20,16 17.5,18.5" />
            <path d="M20 22 H11" />
            <polyline points="13.5,19.5 11,22 13.5,24.5" />
          </svg>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1 }}>
              Packet Tracer
            </div>
            <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1, color: "#a3a3a3" }}>
              Converter
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 56,
            fontSize: 30,
            color: "#a3a3a3",
            textAlign: "center",
            maxWidth: 900,
          }}
        >
          Convert .pkt &amp; .pka to XML or AI-friendly JSON — fully in your browser.
        </div>
      </div>
    ),
    size,
  );
}
