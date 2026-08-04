import {
  encodeBase64,
  exportJobPayloadSchema,
  type ExportJobPayload,
  type WireDocumentAsset,
} from "@markdown-mint/document-schema";

export type Locale = "zh-CN" | "en";
export type OutputFormat = "html" | "pdf";
export type Step = "configure" | "generate" | "import" | "result" | "theme";

export type JobStatus = ExportJobPayload;

export interface AttachedAsset {
  bytes: Uint8Array;
  mediaType: string;
  path: string;
}

export function toWireAssets(assets: readonly AttachedAsset[]): WireDocumentAsset[] {
  return assets.map((asset) => ({
    bytes: encodeBase64(asset.bytes),
    mediaType: asset.mediaType,
    path: asset.path,
  }));
}

export function parseJobPayload(value: unknown): JobStatus {
  return exportJobPayloadSchema.parse(value);
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
