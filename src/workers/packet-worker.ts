import { decryptPacket, encryptXml } from "@/lib/packet-crypto";
import { simplifyXmlForLlm, type SimplifierMetadata } from "@/lib/xml-simplifier";

type Req =
  | { id: number; op: "encrypt"; bytes: ArrayBuffer }
  | { id: number; op: "decrypt"; bytes: ArrayBuffer }
  | { id: number; op: "simplify"; xmlText: string; meta: SimplifierMetadata };

const worker = self as unknown as Worker;

worker.onmessage = (ev: MessageEvent<Req>) => {
  const m = ev.data;
  try {
    if (m.op === "encrypt") {
      const out = encryptXml(new Uint8Array(m.bytes));
      worker.postMessage({ id: m.id, ok: true, bytes: out.buffer }, [out.buffer]);
    } else if (m.op === "decrypt") {
      const out = decryptPacket(new Uint8Array(m.bytes));
      worker.postMessage({ id: m.id, ok: true, bytes: out.buffer }, [out.buffer]);
    } else {
      const json = simplifyXmlForLlm(m.xmlText, m.meta);
      worker.postMessage({ id: m.id, ok: true, json });
    }
  } catch (err) {
    worker.postMessage({
      id: m.id,
      ok: false,
      error: err instanceof Error ? err.message : "Worker error",
    });
  }
};
