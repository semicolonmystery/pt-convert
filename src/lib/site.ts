export const SITE_URL = "https://pt-convert.podik.cz";
export const SITE_NAME = "Packet Tracer Converter";
export const SITE_TITLE = `${SITE_NAME} — PKT/PKA to AI-ready JSON & XML`;
export const SITE_DESCRIPTION =
  "Turn Cisco Packet Tracer .pkt/.pka files into compact JSON for AI context: devices, configs, links, VLANs. Also XML ↔ .pkt. Runs in your browser, no upload.";
/** The social card, generated at build time by src/app/og.png/route.tsx. */
export const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Packet Tracer Converter — client-side PKT/PKA converter",
} as const;
export const REPO_URL = "https://github.com/semicolonmystery/pt-convert";
export const SPONSOR_URL = "https://github.com/sponsors/semicolonmystery";
