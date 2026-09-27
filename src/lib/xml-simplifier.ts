import { XMLParser } from "fast-xml-parser";

type JsonLike = Record<string, unknown>;

export interface SimplifierMetadata {
  originalFilename: string;
  fileSize: number;
  fileType: "PKT" | "PKA";
}

export interface SimplifiedPacket {
  devices: Record<string, JsonLike>;
  links: JsonLike[];
  notes: JsonLike[];
  metadata: JsonLike;
  activityInstructions: string[];
  networkFilters: Record<string, boolean>;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function readText(node: unknown): string {
  if (node == null) {
    return "";
  }
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }
  if (typeof node === "object") {
    const asObj = node as Record<string, unknown>;
    if ("#text" in asObj) {
      return readText(asObj["#text"]);
    }
  }
  return "";
}

function readLines(node: unknown): string[] {
  return asArray((node as JsonLike | undefined)?.LINE).map((line) => readText(line)).filter(Boolean);
}

function getDeviceEngines(packetTracer: JsonLike): JsonLike[] {
  const network = (packetTracer.NETWORK as JsonLike | undefined) ?? {};
  const deviceNodes = asArray((network.DEVICES as JsonLike | undefined)?.DEVICE as JsonLike[] | JsonLike);
  return deviceNodes.map((deviceNode) => (deviceNode.ENGINE as JsonLike | undefined) ?? {});
}

function toNumber(value: unknown): number | null {
  const parsed = Number.parseFloat(readText(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toBooleanFromYesNo(value: unknown): boolean {
  return readText(value).toLowerCase() === "yes";
}

function parseRoot(xml: string): {
  packetTracer: JsonLike;
  activityRoot: JsonLike;
} {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    parseTagValue: false,
    trimValues: true,
  });
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const activityRoot = (parsed.PACKETTRACER5_ACTIVITY as JsonLike | undefined) ?? {};

  const candidateRoots = [
    ...asArray(activityRoot.PACKETTRACER5 as JsonLike | JsonLike[] | undefined),
    ...asArray(parsed.PACKETTRACER5 as JsonLike | JsonLike[] | undefined),
  ];

  const packetTracer =
    candidateRoots.find((root) => {
      const rootObj = root as JsonLike;
      const network = rootObj.NETWORK as JsonLike | undefined;
      return Boolean(network?.DEVICES || rootObj.FILTERS || rootObj.PHYSICALWORKSPACE);
    }) ?? (candidateRoots[0] as JsonLike | undefined) ?? {};

  return { packetTracer, activityRoot };
}

function findAllByKey(node: unknown, wantedKey: string, found: JsonLike[] = []): JsonLike[] {
  if (node == null || typeof node !== "object") {
    return found;
  }
  const obj = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (key === wantedKey && value && typeof value === "object") {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object") {
            found.push(item as JsonLike);
          }
        }
      } else {
        found.push(value as JsonLike);
      }
    } else if (value && typeof value === "object") {
      findAllByKey(value, wantedKey, found);
    }
  }
  return found;
}

function extractPorts(engine: JsonLike): Record<string, JsonLike> {
  const ports = findAllByKey(engine, "PORT");
  const out: Record<string, JsonLike> = {};
  ports.forEach((port, index) => {
    const key = `Port_${index}`;
    out[key] = {
      Name: key,
      Type: readText(port.TYPE),
      Mac: readText(port.MACADDRESS || port.BIA),
      Ip: readText(port.IP),
      Subnet: readText(port.SUBNET),
      Speed: readText(port.SPEED),
      Power: readText(port.POWER),
    };
  });
  return out;
}

function extractDeviceConfig(engine: JsonLike): string[] {
  const runningConfigNode = (engine.RUNNINGCONFIG as JsonLike | undefined) ?? {};
  const startupConfigNode = (engine.STARTUPCONFIG as JsonLike | undefined) ?? {};
  const configNode = (engine.CONFIG as JsonLike | undefined) ?? {};

  for (const node of [runningConfigNode, configNode, startupConfigNode]) {
    const lines = readLines(node);
    if (lines.length > 0) {
      return lines;
    }
  }

  const cfgText = readText(runningConfigNode) || readText(configNode) || readText(startupConfigNode);
  if (cfgText.includes("\n")) {
    return cfgText.split("\n").map((line) => line.trimEnd()).filter(Boolean);
  }
  return [];
}

function extractVlans(engine: JsonLike): JsonLike[] {
  const vlans = asArray((engine.VLANS as JsonLike | undefined)?.VLAN as JsonLike[] | JsonLike);
  return vlans.map((vlan) => ({
    id: readText(vlan["@number"]),
    name: readText(vlan["@name"]),
    rspan: readText(vlan["@rspan"]),
  }));
}

function extractVtp(engine: JsonLike): JsonLike | null {
  const vtp = (engine.VTP as JsonLike | undefined) ?? null;
  if (!vtp) {
    return null;
  }
  return {
    domainName: readText(vtp.DOMAIN_NAME),
    mode: readText(vtp.MODE),
    version: readText(vtp.VERSION),
    updaterIp: readText(vtp.UPDATER_IP),
  };
}

function extractDevices(packetTracer: JsonLike): Record<string, JsonLike> {
  const devices: Record<string, JsonLike> = {};

  for (const engine of getDeviceEngines(packetTracer)) {
    const name = readText(engine.NAME) || `Device ${Object.keys(devices).length + 1}`;
    const x = toNumber((engine.COORD_SETTINGS as JsonLike | undefined)?.X_COORD);
    const y = toNumber((engine.COORD_SETTINGS as JsonLike | undefined)?.Y_COORD);
    const vlans = extractVlans(engine);
    const vtp = extractVtp(engine);

    const device: JsonLike = {
      type: readText(engine.TYPE),
      notes: readText(engine.DESCRIPTION),
      config: extractDeviceConfig(engine),
      ports: extractPorts(engine),
      coordinates: {
        x: x ?? 0,
        y: y ?? 0,
      },
      power: readText(engine.POWER),
      model: readText((engine.TYPE as JsonLike | undefined)?.["@model"]),
      serialNumber: readText(engine.SERIALNUMBER),
      saveRefId: readText(engine.SAVE_REF_ID),
      systemName: readText(engine.SYS_NAME),
      ntp: {
        serviceEnabled: readText((engine.NTP as JsonLike | undefined)?.SERVICE_ENABLED),
        key: readText((engine.NTP as JsonLike | undefined)?.KEY) || "0",
      },
    };

    if (vlans.length > 0) {
      device.vlans = vlans;
    }
    if (vtp) {
      device.vtp = vtp;
    }
    const startupConfig = readLines(engine.STARTUPCONFIG);
    if (startupConfig.length > 0) {
      device.startupConfig = startupConfig;
    }

    devices[name] = device;
  }

  return devices;
}

function buildRefMap(packetTracer: JsonLike): Record<string, string> {
  const refs: Record<string, string> = {};
  for (const engine of getDeviceEngines(packetTracer)) {
    const ref = readText(engine.SAVE_REF_ID);
    const name = readText(engine.NAME);
    if (ref && name) {
      refs[ref] = name;
    }
  }
  return refs;
}

function extractLinks(packetTracer: JsonLike): JsonLike[] {
  const network = (packetTracer.NETWORK as JsonLike | undefined) ?? {};
  const linkNodes = asArray((network.LINKS as JsonLike | undefined)?.LINK as JsonLike[] | JsonLike);
  const refMap = buildRefMap(packetTracer);

  return linkNodes
    .map((linkNode) => {
      const cable = (linkNode.CABLE as JsonLike | undefined) ?? {};
      const ports = asArray(cable.PORT).map((port) => readText(port));
      const fromRef = readText(cable.FROM);
      const toRef = readText(cable.TO);
      return {
        FromDevice: refMap[fromRef] ?? fromRef,
        FromPort: ports[0] ?? "",
        ToDevice: refMap[toRef] ?? toRef,
        ToPort: ports[1] ?? "",
      };
    })
    .filter((item) => String(item.FromDevice || item.ToDevice || item.FromPort || item.ToPort).length > 0);
}

function extractNotes(packetTracer: JsonLike): JsonLike[] {
  const workspace = (packetTracer.PHYSICALWORKSPACE as JsonLike | undefined) ?? {};
  const noteNodes = asArray((workspace.NOTES as JsonLike | undefined)?.NOTE as JsonLike[] | JsonLike);
  return noteNodes
    .map((note) => ({
      text: readText(note.TEXT),
      x: toNumber(note.X) ?? 0,
      y: toNumber(note.Y) ?? 0,
      z: toNumber(note.Z) ?? 0,
    }))
    .filter((note) => String(note.text).trim().length > 0);
}

function extractFilters(packetTracer: JsonLike): Record<string, boolean> {
  const filters = (packetTracer.FILTERS as JsonLike | undefined) ?? {};
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (key.startsWith("@")) {
      result[key.slice(1)] = toBooleanFromYesNo(value);
    }
  }
  return result;
}

function extractActivityInstructions(activityRoot: JsonLike, packetTracer: JsonLike): string[] {
  const scenarioSet = (packetTracer.SCENARIOSET as JsonLike | undefined) ?? {};
  const scenarios = scenarioSet.SCENARIO as JsonLike | JsonLike[] | undefined;
  const firstScenario = Array.isArray(scenarios) ? scenarios[0] : scenarios;

  const candidates = [
    readText((activityRoot.ACTIVITY as JsonLike | undefined)?.INSTRUCTIONS),
    readText((activityRoot.ACTIVITY as JsonLike | undefined)?.DESCRIPTION),
    readText((firstScenario as JsonLike | undefined)?.DESCRIPTION),
  ]
    .join("\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return Array.from(new Set(candidates));
}

export function simplifyXmlToJson(xml: string, source: SimplifierMetadata): SimplifiedPacket {
  const { packetTracer, activityRoot } = parseRoot(xml);
  const devices = extractDevices(packetTracer);
  const links = extractLinks(packetTracer);
  const notes = extractNotes(packetTracer);
  const activityInstructions = extractActivityInstructions(activityRoot, packetTracer);
  const networkFilters = extractFilters(packetTracer);

  return {
    devices,
    links,
    notes,
    metadata: {
      originalFilename: source.originalFilename,
      fileSize: source.fileSize,
      convertedAt: new Date().toISOString(),
      deviceCount: Object.keys(devices).length,
      linkCount: links.length,
      noteCount: notes.length,
      converterVersion: "1.1.0",
      converterUrl: "packet-tracer-tool",
      fileType: source.fileType,
    },
    activityInstructions,
    networkFilters,
  };
}
