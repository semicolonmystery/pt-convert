"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileUp, Loader2, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { WorkerRequest, WorkerResponse, WorkerResult } from "@/workers/packet-worker-protocol";

type FileMode = "xml" | "packet" | null;
type DecryptTarget = "json" | "xml";

function getFileMode(filename: string): FileMode {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "xml") return "xml";
  if (ext === "pkt" || ext === "pka") return "packet";
  return null;
}

function stripExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx > 0 ? filename.slice(0, idx) : filename;
}

function downloadContent(content: Uint8Array<ArrayBuffer>, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [decryptTarget, setDecryptTarget] = useState<DecryptTarget>("json");
  const [prettyPrint, setPrettyPrint] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [indent, setIndent] = useState("2");
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultBytes, setResultBytes] = useState<Uint8Array<ArrayBuffer> | null>(null);
  const [resultFilename, setResultFilename] = useState("");
  const [resultMime, setResultMime] = useState("text/plain");

  const fileMode = file ? getFileMode(file.name) : null;

  useEffect(() => {
    workerRef.current = new Worker(
      new URL("@/workers/packet-worker.ts", import.meta.url),
      { type: "module" },
    );
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  function callWorker<R extends WorkerRequest>(
    request: R,
    transfer: Transferable[] = [],
  ): Promise<WorkerResult<R["op"]>> {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("Worker not ready"));
    const id = ++reqIdRef.current;
    return new Promise((resolve, reject) => {
      const onMsg = (e: MessageEvent<WorkerResponse>) => {
        if (e.data?.id !== id) return;
        worker.removeEventListener("message", onMsg);
        if (e.data.ok) resolve(e.data as unknown as WorkerResult<R["op"]>);
        else reject(new Error(e.data.error ?? "Worker error"));
      };
      worker.addEventListener("message", onMsg);
      worker.postMessage({ ...request, id }, transfer);
    });
  }

  function setResult(bytes: Uint8Array<ArrayBuffer>, filename: string, mimeType: string): void {
    setResultBytes(bytes);
    setResultFilename(filename);
    setResultMime(mimeType);
  }

  function clearResult(): void {
    setResultBytes(null);
    setResultFilename("");
    setResultMime("text/plain");
  }

  function applyFile(next: File | null): void {
    if (!next) return;
    const mode = getFileMode(next.name);
    if (!mode) {
      toast.error("Unsupported file type. Please use .xml, .pkt, or .pka.");
      return;
    }
    setFile(next);
    clearResult();
    toast.success(`Loaded ${next.name}`);
  }

  async function runOperation(): Promise<void> {
    if (!file || !fileMode) {
      toast.error("Please select a supported file first.");
      return;
    }

    const toastId = toast.loading("Processing file...");
    setIsProcessing(true);

    try {
      const inputBuf = await file.arrayBuffer();

      if (fileMode === "xml") {
        const { bytes } = await callWorker({ op: "encrypt", bytes: inputBuf }, [inputBuf]);
        setResult(new Uint8Array(bytes), `${stripExtension(file.name)}.pkt`, "application/octet-stream");
        toast.success("Encryption completed.", { id: toastId });
        return;
      }

      const decrypted = await callWorker({ op: "decrypt", bytes: inputBuf }, [inputBuf]);

      if (decryptTarget === "xml") {
        setResult(new Uint8Array(decrypted.bytes), `${stripExtension(file.name)}.xml`, "application/xml");
        toast.success("Decryption to XML completed.", { id: toastId });
        return;
      }

      const xmlText = new TextDecoder().decode(decrypted.bytes);
      const { json: simplified } = await callWorker({
        op: "simplify",
        xmlText,
        meta: {
          originalFilename: file.name,
          fileSize: file.size,
          fileType: file.name.toLowerCase().endsWith(".pka") ? "PKA" : "PKT",
        },
      });
      const outputPayload = includeMetadata
        ? simplified
        : Object.fromEntries(Object.entries(simplified).filter(([key]) => key !== "metadata"));
      const spaces = prettyPrint ? Number.parseInt(indent, 10) : 0;
      const jsonText = JSON.stringify(outputPayload, null, Number.isFinite(spaces) ? spaces : 2);
      setResult(new TextEncoder().encode(jsonText), `${stripExtension(file.name)}.json`, "application/json");
      toast.success("Decryption to JSON completed.", { id: toastId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown processing error.";
      toast.error(message, { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <main className="flex w-full flex-col">
      <div className="relative flex min-h-screen w-full items-center justify-center p-4">
        <h1 className="sr-only">Packet Tracer Converter — turn .pkt and .pka files into JSON context for LLMs</h1>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4 md:p-6">
          <div className="pointer-events-auto">
            <Dialog>
              <DialogTrigger
                render={
                  <Button variant="outline" size="sm">
                    How it works
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>What this tool is for</DialogTitle>
                  <DialogDescription>
                    This app converts Packet Tracer files fully in your browser. It helps you decrypt `.pkt/.pka` to
                    native XML or to simplified JSON that is easier for LLMs to reason about.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>1. Drop a `.pkt/.pka` file and pick JSON or XML output.</p>
                  <p>2. For LLM work, choose JSON and keep metadata enabled.</p>
                  <p>3. Download the result and feed JSON into your model for topology analysis.</p>
                  <p>4. Drop `.xml` when you want to re-encrypt back to `.pkt`.</p>
                </div>
                <DialogFooter showCloseButton />
              </DialogContent>
            </Dialog>
          </div>
          <div className="pointer-events-auto">
            <ModeToggle />
          </div>
        </div>

        <Card className="w-full max-w-3xl">
          <CardContent className="space-y-4 pt-6">
            <input
              ref={inputRef}
              type="file"
              accept=".xml,.pkt,.pka"
              className="hidden"
              onChange={(event) => applyFile(event.target.files?.[0] ?? null)}
            />

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      applyFile(event.dataTransfer.files?.[0] ?? null);
                    }}
                    className="flex min-h-36 w-full flex-col items-center justify-center gap-1 border-dashed bg-muted/30 p-4 text-center transition hover:bg-muted/60"
                  >
                    <FileUp className="mb-2 size-5 text-muted-foreground" />
                    <span className="font-medium">Drop a file here or click to choose</span>
                    <span className="text-sm text-muted-foreground">Supported: .xml, .pkt, .pka</span>
                  </Button>
                }
              />
              <TooltipContent>Drop an .xml, .pkt, or .pka file — or click to browse</TooltipContent>
            </Tooltip>

            {file ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{file.name}</Badge>
                <Badge variant="secondary">{fileMode?.toUpperCase() ?? "UNKNOWN"}</Badge>
              </div>
            ) : (
              <Alert>
                <AlertTitle>No file selected</AlertTitle>
                <AlertDescription>Select a file to display operation controls.</AlertDescription>
              </Alert>
            )}

            {fileMode === "packet" && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="text-sm font-medium">Decrypt options</div>
                <RadioGroup
                  value={decryptTarget}
                  onValueChange={(value) => {
                    setDecryptTarget(value as DecryptTarget);
                    clearResult();
                  }}
                >
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <div className="inline-flex w-fit items-center gap-2">
                          <RadioGroupItem id="target-json" value="json" />
                          <Label htmlFor="target-json" className="text-sm cursor-pointer">
                            Decrypt to simplified JSON
                          </Label>
                        </div>
                      }
                    />
                    <TooltipContent>Topology data, LLM-friendly, smaller</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <div className="inline-flex w-fit items-center gap-2">
                          <RadioGroupItem id="target-xml" value="xml" />
                          <Label htmlFor="target-xml" className="text-sm cursor-pointer">
                            Decrypt to native XML
                          </Label>
                        </div>
                      }
                    />
                    <TooltipContent>Raw Packet Tracer XML, full fidelity</TooltipContent>
                  </Tooltip>
                </RadioGroup>
                {decryptTarget === "json" && (
                  <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 pt-1">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <div className="flex items-center gap-2">
                            <Label htmlFor="indent" className="text-sm">
                              Indentation
                            </Label>
                            <Select
                              value={indent}
                              onValueChange={(value) => {
                                setIndent(value ?? "2");
                                clearResult();
                              }}
                            >
                              <SelectTrigger id="indent" className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">Compact</SelectItem>
                                <SelectItem value="2">2 spaces</SelectItem>
                                <SelectItem value="4">4 spaces</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        }
                      />
                      <TooltipContent>Spaces per indent level in the output JSON</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <div className="flex items-center gap-2">
                            <Switch
                              id="pretty"
                              checked={prettyPrint}
                              onCheckedChange={(value) => {
                                setPrettyPrint(value);
                                clearResult();
                              }}
                            />
                            <Label htmlFor="pretty" className="text-sm cursor-pointer">
                              Pretty print
                            </Label>
                          </div>
                        }
                      />
                      <TooltipContent>Newlines &amp; indentation; disable for compact output</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="meta"
                              checked={includeMetadata}
                              onCheckedChange={(value) => {
                                setIncludeMetadata(Boolean(value));
                                clearResult();
                              }}
                            />
                            <Label htmlFor="meta" className="text-sm cursor-pointer">
                              Include metadata
                            </Label>
                          </div>
                        }
                      />
                      <TooltipContent>Include file version, build info and other PT metadata</TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
            )}

            {fileMode && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      onClick={runOperation}
                      disabled={isProcessing}
                      className="w-full"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Processing…
                        </>
                      ) : fileMode === "xml" ? (
                        <>
                          <Lock className="size-4" />
                          Encrypt
                        </>
                      ) : (
                        <>
                          <LockOpen className="size-4" />
                          Decrypt
                        </>
                      )}
                    </Button>
                  }
                />
                <TooltipContent>
                  {fileMode === "xml"
                    ? "Wrap XML in the Packet Tracer .pkt container"
                    : "Unwrap the .pkt / .pka to your chosen format"}
                </TooltipContent>
              </Tooltip>
            )}

            {resultBytes && resultFilename && (
              <Alert>
                <AlertTitle>Output ready</AlertTitle>
                <AlertDescription>
                  {resultFilename} ({resultBytes.length.toLocaleString()}{" "}bytes). Use the &quot;Download
                  result&quot; button to save.
                </AlertDescription>
              </Alert>
            )}
            {resultBytes && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="default"
                      onClick={() =>
                        downloadContent(resultBytes, resultFilename, resultMime)
                      }
                      className="w-full"
                    >
                      <Download className="size-4" />
                      Download result
                    </Button>
                  }
                />
                <TooltipContent>Save {resultFilename || "the output file"}</TooltipContent>
              </Tooltip>
            )}
          </CardContent>
        </Card>
      </div>

      <AboutSection />
    </main>
  );
}

const FAQ: { question: string; answer: string }[] = [
  {
    question: "What ends up in the JSON?",
    answer:
      "devices keyed by hostname (type, model, config lines, ports with IP, mask and MAC, VLANs, VTP), links resolved to device names and ports, notes, the activity instructions from .pka files, and optional metadata. The rest of the XML is left out, which is what keeps it small enough for a context window.",
  },
  {
    question: "JSON or XML: which one should I give the model?",
    answer:
      "JSON, almost always. It carries the same configs and addressing in a fraction of the size. Use native XML only when you need something the JSON leaves out, and expect it to be much larger.",
  },
  {
    question: "Metadata and pretty print: on or off?",
    answer:
      "Metadata only adds the file name, counts and converter info, so turn it off to save tokens. Compact output saves a bit more; models read both equally well.",
  },
  {
    question: "Can the model's edits go back into Packet Tracer?",
    answer:
      "Only through XML. Decrypt to native XML, edit it, drop the .xml back in and press Encrypt to get a .pkt. The JSON is a one-way summary.",
  },
  {
    question: "Is the file uploaded?",
    answer:
      "No. Decryption and conversion run in a Web Worker in your browser and nothing is sent to a server. What you paste into the LLM afterwards is up to you.",
  },
];

function AboutSection() {
  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-12 text-sm text-muted-foreground">
      <h2 className="text-base font-medium text-foreground">Packet Tracer labs as LLM context</h2>
      <p>
        A screenshot of a Packet Tracer lab gives an LLM a picture to guess from, and the .pkt itself is
        encrypted, so the model can&apos;t read it. This decrypts .pkt and .pka files and turns them into compact
        JSON the model can reason over: every device with its config, interfaces and addressing, the VLANs, the
        cabling between devices and, for .pka activities, the task instructions.
      </p>
      <p>
        Attach the JSON at the start of a chat, then ask why a ping fails, what is left to configure, or for a
        review of the configs. Need the full file instead? Decrypt to native XML, and encrypt edited XML back to
        .pkt.
      </p>
      <div className="space-y-2">
        {FAQ.map(({ question, answer }) => (
          <details key={question} className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium text-foreground">{question}</summary>
            <p className="pt-2">{answer}</p>
          </details>
        ))}
      </div>
      <p className="text-xs">
        Not affiliated with Cisco Systems. Cisco Packet Tracer is a trademark of Cisco Systems, Inc.
      </p>
    </section>
  );
}
