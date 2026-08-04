export type Locale = "zh-CN" | "en";
export type OutputFormat = "html" | "pdf";
export type Step = "configure" | "generate" | "import" | "result" | "theme";

export interface JobArtifact {
  fileName: string;
  format: OutputFormat;
  mediaType: string;
  pageCount?: number;
  sha256: string;
  sizeBytes: number;
  thumbnail?: {
    fileName: string;
    mediaType: "image/png";
    sha256: string;
    sizeBytes: number;
  };
}

export interface JobLog {
  durationMs?: number;
  finishedAt?: number;
  stage: string;
  startedAt: number;
}

export interface JobStatus {
  artifact?: JobArtifact;
  attempt: number;
  diagnostics: Array<{ level: string; message: string; rule: string }>;
  downloads?: {
    artifactUrl?: string;
    expiresAt?: number;
    thumbnailUrl?: string;
  };
  error?: { code: string; message: string };
  id: string;
  logs: JobLog[];
  state: string;
}

export interface AttachedAsset {
  bytes: Uint8Array;
  id: string;
  mediaType: string;
  path: string;
}

export interface WireDocumentAsset {
  bytes: string;
  mediaType: string;
  path: string;
}

/**
 * Keep encoding in the web bundle without importing Zod/document-schema.
 * Zod's internal `process` helper collides with Nitro's `node:process` import
 * when both land in the same SSR chunk.
 */
export function encodeBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.byteLength; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return globalThis.btoa(binary);
}

export function toWireAssets(assets: readonly AttachedAsset[]): WireDocumentAsset[] {
  return assets.map((asset) => ({
    bytes: encodeBase64(asset.bytes),
    mediaType: asset.mediaType,
    path: asset.path,
  }));
}

export function parseJobPayload(value: unknown): JobStatus {
  if (!value || typeof value !== "object") {
    throw new Error("invalid-job-payload");
  }
  const candidate = value as JobStatus;
  if (typeof candidate.id !== "string" || typeof candidate.state !== "string") {
    throw new Error("invalid-job-payload");
  }
  return candidate;
}

export function newIdempotencyKey(): string {
  return `web-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function stateLabel(state: string, locale: Locale): string {
  const labels: Record<string, string> =
    locale === "en"
      ? {
          cancelled: "Cancelled",
          compiling: "Compiling",
          expired: "Expired",
          failed: "Failed",
          packaging: "Packaging",
          queued: "Queued",
          rendering: "Rendering",
          succeeded: "Ready",
        }
      : {
          cancelled: "已取消",
          compiling: "编译中",
          expired: "已过期",
          failed: "失败",
          packaging: "打包中",
          queued: "排队中",
          rendering: "渲染中",
          succeeded: "已完成",
        };
  return labels[state] ?? state;
}

export function guessImageMediaType(fileName: string): string | undefined {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return undefined;
}
