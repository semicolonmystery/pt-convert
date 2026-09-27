import { decryptPacket, encryptXml } from "@/lib/packet-crypto";
import { simplifyXmlToJson } from "@/lib/xml-simplifier";
import type { WorkerRequest, WorkerResponse } from "@/workers/packet-worker-protocol";

const worker = self as unknown as Worker;

function reply(message: WorkerResponse, transfer: Transferable[] = []): void {
  worker.postMessage(message, transfer);
}

worker.onmessage = (ev: MessageEvent<WorkerRequest & { id: number }>) => {
  const m = ev.data;
  try {
    if (m.op === "encrypt") {
      const out = encryptXml(new Uint8Array(m.bytes));
      reply({ id: m.id, ok: true, bytes: out.buffer as ArrayBuffer }, [out.buffer]);
    } else if (m.op === "decrypt") {
      const out = decryptPacket(new Uint8Array(m.bytes));
      reply({ id: m.id, ok: true, bytes: out.buffer as ArrayBuffer }, [out.buffer]);
    } else {
      const json = simplifyXmlToJson(m.xmlText, m.meta);
      reply({ id: m.id, ok: true, json });
    }
  } catch (err) {
    reply({
      id: m.id,
      ok: false,
      error: err instanceof Error ? err.message : "Worker error",
    });
  }
};
