import type { SimplifiedPacket, SimplifierMetadata } from "@/lib/xml-simplifier";

export type WorkerRequest =
  | { op: "encrypt"; bytes: ArrayBuffer }
  | { op: "decrypt"; bytes: ArrayBuffer }
  | { op: "simplify"; xmlText: string; meta: SimplifierMetadata };

export type WorkerResult<Op extends WorkerRequest["op"]> = Op extends "simplify"
  ? { json: SimplifiedPacket }
  : { bytes: ArrayBuffer };

export type WorkerResponse =
  | ({ id: number; ok: true } & ({ bytes: ArrayBuffer } | { json: SimplifiedPacket }))
  | { id: number; ok: false; error: string };
