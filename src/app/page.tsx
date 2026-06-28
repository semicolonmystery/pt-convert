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

function downloadContent(content: string | Uint8Array, filename: string, mimeType: string): void {
  const blob =
    typeof content === "string"
      ? new Blob([content], { type: mimeType })
      : (() => {
          const copy = new Uint8Array(content.byteLength);
          copy.set(content);
          return new Blob([copy], { type: mimeType });
        })();
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
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
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

  function callWorker<T>(
    payload: Record<string, unknown>,
    transfer: Transferable[] = [],
  ): Promise<T> {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("Worker not ready"));
    const id = ++reqIdRef.current;
    return new Promise<T>((resolve, reject) => {
      const onMsg = (e: MessageEvent) => {
        if (e.data?.id !== id) return;
        worker.removeEventListener("message", onMsg);
        if (e.data.ok) resolve(e.data as T);
        else reject(new Error(e.data.error ?? "Worker error"));
      };
      worker.addEventListener("message", onMsg);
      worker.postMessage({ ...payload, id }, transfer);
    });
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
        const { bytes } = await callWorker<{ bytes: ArrayBuffer }>(
          { op: "encrypt", bytes: inputBuf },
          [inputBuf],
        );
        const outputName = `${stripExtension(file.name)}.pkt`;
        setResultBytes(new Uint8Array(bytes));
        setResultFilename(outputName);
        setResultMime("application/octet-stream");
        toast.success("Encryption completed.", { id: toastId });
        return;
      }

      const decrypted = await callWorker<{ bytes: ArrayBuffer }>(
        { op: "decrypt", bytes: inputBuf },
        [inputBuf],
      );

      if (decryptTarget === "xml") {
        const outputName = `${stripExtension(file.name)}.xml`;
        setResultBytes(new Uint8Array(decrypted.bytes));
        setResultFilename(outputName);
        setResultMime("application/xml");
        toast.success("Decryption to XML completed.", { id: toastId });
        return;
      }

      const xmlText = new TextDecoder().decode(decrypted.bytes);
      const { json: simplified } = await callWorker<{ json: Record<string, unknown> }>({
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
      const outputName = `${stripExtension(file.name)}.json`;
      setResultBytes(new TextEncoder().encode(jsonText));
      setResultFilename(outputName);
      setResultMime("application/json");
      toast.success("Decryption to JSON completed.", { id: toastId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown processing error.";
      toast.error(message, { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center p-4">
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

          {fileMode === "xml" && (
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
                    ) : (
                      <>
                        <Lock className="size-4" />
                        Encrypt
                      </>
                    )}
                  </Button>
                }
              />
              <TooltipContent>Wrap XML in the Packet Tracer .pkt container</TooltipContent>
            </Tooltip>
          )}
          {fileMode === "packet" && (
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
                    ) : (
                      <>
                        <LockOpen className="size-4" />
                        Decrypt
                      </>
                    )}
                  </Button>
                }
              />
              <TooltipContent>Unwrap the .pkt / .pka to your chosen format</TooltipContent>
            </Tooltip>
          )}

          {resultBytes && resultFilename && (
            <Alert>
              <AlertTitle>Output ready</AlertTitle>
              <AlertDescription>
                {resultFilename} ({resultBytes.length.toLocaleString()} bytes). Use the &quot;Download
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
  );
}
