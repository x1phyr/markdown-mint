import { z } from "zod";

/** Hard bounds shared by HTTP, in-process managers, and persistence. */
export const EXPORT_LIMITS = {
  maxAccentColorLength: 7,
  maxAssetBytes: 8 * 1024 * 1024,
  maxAssets: 32,
  maxAuthorLength: 200,
  maxCodeThemeLength: 100,
  maxMarkdownBytes: 4 * 1024 * 1024,
  maxMediaTypeLength: 100,
  maxPathLength: 512,
  maxSubtitleLength: 300,
  maxThemeIdLength: 100,
  maxTitleLength: 300,
} as const;

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

/**
 * Wire-safe asset bytes: JSON carries base64 strings; in-process callers may
 * pass a Uint8Array. The parsed DocumentAsset always exposes Uint8Array bytes.
 */
export const documentAssetBytesSchema = z
  .union([
    z.instanceof(Uint8Array),
    z
      .string()
      .min(1)
      .refine((value) => BASE64_PATTERN.test(value), "Asset bytes must be valid base64.")
      .transform((value) => decodeBase64(value)),
  ])
  .refine(
    (bytes) => bytes.byteLength <= EXPORT_LIMITS.maxAssetBytes,
    `Each asset must be at most ${EXPORT_LIMITS.maxAssetBytes} bytes.`,
  );

export const documentAssetSchema = z.object({
  bytes: documentAssetBytesSchema,
  mediaType: z.string().min(1).max(EXPORT_LIMITS.maxMediaTypeLength),
  path: z
    .string()
    .min(1)
    .max(EXPORT_LIMITS.maxPathLength)
    .refine(
      (value) => !value.includes("\0") && !value.split(/[/\\]/u).includes(".."),
      "Asset paths must be relative without parent segments.",
    ),
});

export const exportRequestSchema = z.object({
  appearance: z.object({
    accentColor: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    codeTheme: z.string().min(1).max(EXPORT_LIMITS.maxCodeThemeLength).default("github-light"),
    density: z.enum(["compact", "normal", "relaxed"]).default("normal"),
    themeId: z.string().min(1).max(EXPORT_LIMITS.maxThemeIdLength),
  }),
  document: z.object({
    author: z.string().max(EXPORT_LIMITS.maxAuthorLength).optional(),
    language: z.enum(["zh-CN", "en"]).default("zh-CN"),
    subtitle: z.string().max(EXPORT_LIMITS.maxSubtitleLength).optional(),
    title: z.string().max(EXPORT_LIMITS.maxTitleLength).optional(),
  }),
  features: z.object({
    cover: z.boolean().default(true),
    footer: z.boolean().default(true),
    header: z.boolean().default(false),
    pageNumber: z.boolean().default(true),
    toc: z.boolean().default(true),
  }),
  output: z.object({
    format: z.enum(["pdf", "html"]),
  }),
  page: z.object({
    margin: z.enum(["compact", "normal", "relaxed"]).default("normal"),
    orientation: z.enum(["portrait", "landscape"]).default("portrait"),
    size: z.enum(["A4", "Letter"]).default("A4"),
  }),
  source: z.object({
    assets: z.array(documentAssetSchema).max(EXPORT_LIMITS.maxAssets).default([]),
    markdown: z
      .string()
      .min(1)
      .refine(
        (value) => new TextEncoder().encode(value).byteLength <= EXPORT_LIMITS.maxMarkdownBytes,
        `Markdown must be at most ${EXPORT_LIMITS.maxMarkdownBytes} bytes.`,
      ),
  }),
});

export type DocumentAsset = z.infer<typeof documentAssetSchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;

/** JSON-safe ExportRequest where asset bytes are base64 strings. */
export type WireDocumentAsset = {
  bytes: string;
  mediaType: string;
  path: string;
};

export type WireExportRequest = Omit<ExportRequest, "source"> & {
  source: {
    assets: WireDocumentAsset[];
    markdown: string;
  };
};

export function toWireExportRequest(request: ExportRequest): WireExportRequest {
  return {
    ...request,
    source: {
      markdown: request.source.markdown,
      assets: request.source.assets.map((asset) => ({
        bytes: encodeBase64(asset.bytes),
        mediaType: asset.mediaType,
        path: asset.path,
      })),
    },
  };
}

export const exportJobStateSchema = z.enum([
  "cancelled",
  "compiling",
  "expired",
  "failed",
  "packaging",
  "queued",
  "rendering",
  "succeeded",
]);

export const exportJobErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

export const exportArtifactThumbnailSchema = z.object({
  fileName: z.string().min(1),
  mediaType: z.literal("image/png"),
  sha256: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});

export const exportArtifactSchema = z.object({
  fileName: z.string().min(1),
  format: z.enum(["html", "pdf"]),
  mediaType: z.string().min(1),
  pageCount: z.number().int().positive().optional(),
  sha256: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  thumbnail: exportArtifactThumbnailSchema.optional(),
});

export const exportStageLogSchema = z.object({
  durationMs: z.number().nonnegative().optional(),
  finishedAt: z.number().int().nonnegative().optional(),
  stage: exportJobStateSchema,
  startedAt: z.number().int().nonnegative(),
});

export const exportDiagnosticSchema = z.object({
  level: z.string().min(1),
  message: z.string().min(1),
  rule: z.string().min(1),
  position: z
    .object({
      end: z.object({
        column: z.number().int().nonnegative().optional(),
        line: z.number().int().nonnegative().optional(),
        offset: z.number().int().nonnegative().optional(),
      }),
      start: z.object({
        column: z.number().int().nonnegative().optional(),
        line: z.number().int().nonnegative().optional(),
        offset: z.number().int().nonnegative().optional(),
      }),
    })
    .optional(),
  suggestion: z.string().optional(),
});

export const exportDownloadLinksSchema = z.object({
  artifactUrl: z.string().min(1),
  expiresAt: z.number().int().positive().optional(),
  thumbnailUrl: z.string().min(1).optional(),
});

/** HTTP / browser-facing job payload. Internal managers may carry richer diagnostics. */
export const exportJobPayloadSchema = z.object({
  artifact: exportArtifactSchema.optional(),
  attempt: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  diagnostics: z.array(exportDiagnosticSchema).default([]),
  downloads: exportDownloadLinksSchema.optional(),
  error: exportJobErrorSchema.optional(),
  id: z.string().min(1),
  idempotencyKey: z.string().min(1),
  logs: z.array(exportStageLogSchema).default([]),
  state: exportJobStateSchema,
  traceId: z.string().min(1),
  updatedAt: z.number().int().nonnegative(),
});

export type ExportJobState = z.infer<typeof exportJobStateSchema>;
export type ExportJobError = z.infer<typeof exportJobErrorSchema>;
export type ExportArtifact = z.infer<typeof exportArtifactSchema>;
export type ExportStageLog = z.infer<typeof exportStageLogSchema>;
export type ExportJobPayload = z.infer<typeof exportJobPayloadSchema>;
export type ExportDownloadLinks = z.infer<typeof exportDownloadLinksSchema>;
