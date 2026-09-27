# Packet Tracer Converter

**Copyright Notice:** This project is strictly closed-source and serves solely as a portfolio demonstration. No open-source license is granted. You are welcome to read the code, but you may not download, build, modify, use, or distribute this code in any form. All rights are reserved by the author.

Client-side Packet Tracer converter built with Next.js + shadcn/ui.

**Live site:** [pt-convert.podik.cz](https://pt-convert.podik.cz)

It can:

- Encrypt `.xml` -> `.pkt`
- Decrypt `.pkt` / `.pka` -> `.xml`
- Decrypt `.pkt` / `.pka` -> simplified `.json` (AI-friendly)

All processing happens in the browser. No server-side file processing is used.

## Features

- Fully client-side crypto + conversion pipeline
- Heavy work runs in a Web Worker so the UI stays responsive during processing
- Drag-and-drop file input (`.xml`, `.pkt`, `.pka`)
- Dark/light/system theme switcher

## How it works

Drop an `.xml`, `.pkt`, or `.pka` file and pick the direction:

- **`.xml` -> `.pkt`** — packs your raw XML topology back into a Packet Tracer container so it opens in the app.
- **`.pkt` / `.pka` -> `.xml`** — unpacks the container and gives you the raw XML the app uses internally, with no loss of fidelity.
- **`.pkt` / `.pka` -> simplified JSON** — unpacks the file and then projects the topology (devices, links, notes, metadata) into a compact JSON shape that's easier for AI to read and reason about. You can toggle pretty-printing, indentation, and whether to keep file metadata.

Encryption and decryption, plus the XML-to-JSON simplification, run inside a module Web Worker, so the page never freezes — you can scroll, switch theme, or pick another file while a large `.pkt` is processing.

## Tech stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- next-themes
- pako
- fast-xml-parser
- twofish

## Project structure

- `src/app/page.tsx` – main UI flow
- `src/app/layout.tsx` – root layout, metadata, JSON-LD
- `src/lib/site.ts` – shared site URL, name, title and description
- `src/app/sitemap.ts` / `src/app/robots.ts` – sitemap.xml and robots.txt for search engines
- `src/app/opengraph-image.tsx` – generated 1200×630 social card
- `src/lib/packet-crypto.ts` – packet encryption/decryption pipeline
- `src/lib/xml-simplifier.ts` – XML -> simplified JSON mapping
- `src/workers/packet-worker.ts` – off-main-thread runner for crypto + simplifier
- `src/workers/packet-worker-protocol.ts` – typed messages between the page and the worker
- `src/components/ui/*` – shadcn/ui components

## License

Subject to [All Rights Reserved](./LICENSE).

## Notes

- This project is for interoperability, analysis, and educational use.
- Cisco Packet Tracer and related marks are property of Cisco Systems, Inc.
