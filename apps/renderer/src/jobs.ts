import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  compileMarkdown,
  type CompiledDocument,
  type CompileOptions,
} from "@markdown-mint/compiler";
import {
  exportRequestSchema,
  toWireExportRequest,
  type ExportRequest,
} from "@markdown-mint/document-schema";
import { createDocumentBodyHtml, createStandaloneHtml } from "@markdown-mint/html-exporter";
import { createThemeCss, validateThemeBundle } from "@markdown-mint/theme-runtime";
import { launchThemeBundles } from "@markdown-mint/themes";
import type { ThemeBundle } from "@markdown-mint/theme-runtime";
import {
  createChromiumPdfRenderer,
  inlineResourceReferences,
  PdfRendererError,
  type PdfRenderer,
} from "./pdf-renderer.js";
import {
  ExportStorageError,
  FileExportStorage,
  MemoryExportStorage,
  type ExportStorage,
} from "./storage.js";
import { createVivliostylePdfRenderer } from "./vivliostyle-pdf-renderer.js";

export type ExportJobState =
  | "cancelled"
  | "compiling"
  | "expired"
  | "failed"
  | "packaging"
  | "queued"
  | "rendering"
  | "succeeded";

export interface ExportJobError {
  code: string;
  message: string;
}

export interface ExportArtifact {
  fileName: string;
  format: "html" | "pdf";
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

export interface ExportStageLog {
  durationMs?: number;
  finishedAt?: number;
  stage: ExportJobState;
  startedAt: number;
}

export interface ExportJob {
  attempt: number;
  createdAt: number;
  diagnostics: CompiledDocument["diagnostics"];
  error?: ExportJobError;
  id: string;
  idempotencyKey: string;
  logs: ExportStageLog[];
  state: ExportJobState;
  traceId: string;
  updatedAt: number;
  artifact?: ExportArtifact;
}

export interface ExportLogEvent {
  attempt: number;
  durationMs?: number;
  errorCode?: string;
  event: "export.failed" | "export.expired" | "export.stage";
  jobId: string;
  stage?: ExportJobState;
  state?: "completed" | "started";
  timestamp: number;
  traceId: string;
}

export interface PdfRenderInput {
  compiled: CompiledDocument;
  css: string;
  request: ExportRequest;
  signal?: AbortSignal;
  title: string;
  workspaceDir?: string;
}

export interface ExportJobManagerOptions {
  compiler?: (markdown: string, options?: CompileOptions) => Promise<CompiledDocument>;
  maxAttempts?: number;
  /** Maximum simultaneously executing jobs (compiling/rendering/packaging). */
  maxConcurrent?: number;
  /** Maximum jobs that may be queued or running before submit returns capacity. */
  maxQueued?: number;
  now?: () => number;
  pdfRenderer?: PdfRenderer;
  retentionMs?: number;
  logger?: (event: ExportLogEvent) => void;
  storage?: ExportStorage;
  storageDir?: string;
  themeBundles?: readonly ThemeBundle[];
  timeoutMs?: number;
}

export class JobError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "JobError";
  }
}

interface InternalExportJob extends ExportJob {
  abortController?: AbortController;
  cancelRequested: boolean;
  request: ExportRequest;
  requestFingerprint: string;
  timeoutRequested: boolean;
}

const ACTIVE_STATES: readonly ExportJobState[] = ["queued", "compiling", "rendering", "packaging"];

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fingerprintRequest(request: ExportRequest): string {
  return createHash("sha256")
    .update(JSON.stringify(toWireExportRequest(request)))
    .digest("hex");
}

function escapePdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7e]/gu, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

/**
 * A small, deterministic PDF adapter reserved for unit tests and local
 * development. Production managers use the Chromium paged-media adapter and
 * fail closed when its pinned browser runtime is unavailable.
 */
export function createFallbackPdf(title: string): Uint8Array {
  const stream = `BT /F1 18 Tf 72 770 Td (${escapePdfText("MarkdownMint")}) Tj 0 -28 Td (${escapePdfText(title)}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n%\xff\xff\xff\xff\n";
  const offsets: number[] = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const startXref = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "binary"));
}

function titleForRequest(request: ExportRequest, compiled: CompiledDocument): string {
  return compiled.metadata.title ?? request.document.title ?? "MarkdownMint document";
}

function copyJob(job: InternalExportJob): ExportJob {
  return {
    attempt: job.attempt,
    createdAt: job.createdAt,
    diagnostics: job.diagnostics,
    ...(job.error ? { error: job.error } : {}),
    id: job.id,
    idempotencyKey: job.idempotencyKey,
    logs: job.logs.map((log) => ({ ...log })),
    state: job.state,
    traceId: job.traceId,
    updatedAt: job.updatedAt,
    ...(job.artifact ? { artifact: { ...job.artifact } } : {}),
  };
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError")
  );
}

export class ExportJobManager {
  private readonly compiler: NonNullable<ExportJobManagerOptions["compiler"]>;
  private readonly jobs = new Map<string, InternalExportJob>();
  private readonly artifacts = new Map<string, Uint8Array>();
  private readonly thumbnails = new Map<string, Uint8Array>();
  private readonly idempotency = new Map<string, string>();
  private readonly running = new Set<string>();
  private readonly maxAttempts: number;
  private readonly maxConcurrent: number;
  private readonly maxQueued: number;
  private readonly now: () => number;
  private readonly pdfRenderer: NonNullable<ExportJobManagerOptions["pdfRenderer"]>;
  private readonly retentionMs: number;
  private readonly logger: NonNullable<ExportJobManagerOptions["logger"]>;
  private readonly storage: ExportStorage;
  private readonly themeBundles: readonly ThemeBundle[];
  private readonly timeoutMs: number;

  constructor(options: ExportJobManagerOptions = {}) {
    this.compiler = options.compiler ?? compileMarkdown;
    this.maxAttempts = options.maxAttempts ?? 2;
    this.maxConcurrent = Math.max(
      1,
      options.maxConcurrent ?? configuredEnvInt("RENDERER_MAX_CONCURRENT", 2, 32),
    );
    this.maxQueued = Math.max(
      this.maxConcurrent,
      options.maxQueued ?? configuredEnvInt("RENDERER_MAX_QUEUED", 20, 200),
    );
    this.now = options.now ?? Date.now;
    this.pdfRenderer =
      options.pdfRenderer ??
      (process.env.PDF_BACKEND === "vivliostyle"
        ? createVivliostylePdfRenderer()
        : createChromiumPdfRenderer());
    this.retentionMs = options.retentionMs ?? 60 * 60 * 1000;
    this.logger = options.logger ?? (() => undefined);
    this.storage =
      options.storage ??
      (options.storageDir ? new FileExportStorage(options.storageDir) : new MemoryExportStorage());
    this.themeBundles = options.themeBundles ?? launchThemeBundles;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.restorePersistedJobs();
  }

  submit(
    input: unknown,
    idempotencyKey: string = randomUUID(),
    traceId: string = randomUUID(),
  ): ExportJob {
    const parsed = exportRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new JobError("invalid-request", "Export request failed schema validation.");
    }

    const key = idempotencyKey.trim();
    if (!key) throw new JobError("idempotency-key", "An idempotency key is required.");
    const requestFingerprint = fingerprintRequest(parsed.data);
    const existingId = this.idempotency.get(key);
    if (existingId) {
      const existing = this.jobs.get(existingId);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          throw new JobError(
            "idempotency-conflict",
            "Idempotency key was reused with a different export request.",
          );
        }
        return copyJob(existing);
      }
    }

    if (this.activeJobCount() >= this.maxQueued) {
      throw new JobError(
        "capacity",
        "The renderer is at capacity. Retry after an in-flight export finishes.",
      );
    }

    const timestamp = this.now();
    const job: InternalExportJob = {
      attempt: 1,
      cancelRequested: false,
      createdAt: timestamp,
      diagnostics: [],
      id: randomUUID(),
      idempotencyKey: key,
      logs: [],
      request: parsed.data,
      requestFingerprint,
      state: "queued",
      traceId: normalizeTraceId(traceId),
      timeoutRequested: false,
      updatedAt: timestamp,
    };
    this.storage.save({ job: copyJob(job), request: job.request });
    this.jobs.set(job.id, job);
    this.idempotency.set(key, job.id);
    this.schedule();
    return copyJob(job);
  }

  get(jobId: string): ExportJob | undefined {
    const job = this.jobs.get(jobId);
    return job ? copyJob(job) : undefined;
  }

  getArtifact(jobId: string): Uint8Array | undefined {
    const bytes = this.artifacts.get(jobId);
    return bytes ? new Uint8Array(bytes) : undefined;
  }

  getThumbnail(jobId: string): Uint8Array | undefined {
    const bytes = this.thumbnails.get(jobId);
    return bytes ? new Uint8Array(bytes) : undefined;
  }

  cancel(jobId: string): ExportJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    if (job.state === "queued") {
      this.transition(job, "cancelled");
      job.cancelRequested = true;
      job.abortController?.abort();
      this.safePersist(job);
      this.schedule();
    } else if (!["cancelled", "expired", "failed", "succeeded"].includes(job.state)) {
      job.cancelRequested = true;
      job.abortController?.abort();
    }
    return copyJob(job);
  }

  retry(jobId: string): ExportJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job || !["cancelled", "failed"].includes(job.state) || job.attempt >= this.maxAttempts) {
      return job ? copyJob(job) : undefined;
    }
    if (this.activeJobCount() >= this.maxQueued) {
      throw new JobError(
        "capacity",
        "The renderer is at capacity. Retry after an in-flight export finishes.",
      );
    }
    job.attempt += 1;
    job.cancelRequested = false;
    delete job.error;
    delete job.artifact;
    delete job.abortController;
    job.timeoutRequested = false;
    this.artifacts.delete(job.id);
    this.thumbnails.delete(job.id);
    this.transition(job, "queued");
    this.safePersist(job);
    this.schedule();
    return copyJob(job);
  }

  expire(now = this.now()): void {
    for (const job of this.jobs.values()) {
      if (
        ["succeeded", "failed", "cancelled"].includes(job.state) &&
        now - job.updatedAt >= this.retentionMs
      ) {
        try {
          this.storage.remove(job.id);
        } catch {
          continue;
        }
        this.artifacts.delete(job.id);
        this.thumbnails.delete(job.id);
        job.state = "expired";
        delete job.artifact;
        job.updatedAt = now;
        this.emit(job, {
          event: "export.expired",
          timestamp: now,
        });
      }
    }
  }

  async waitFor(jobId: string): Promise<ExportJob | undefined> {
    while (true) {
      const job = this.jobs.get(jobId);
      if (!job) return undefined;
      if (["cancelled", "expired", "failed", "succeeded"].includes(job.state)) return copyJob(job);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  async close(): Promise<void> {
    await this.pdfRenderer.close?.();
  }

  private activeJobCount(): number {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (ACTIVE_STATES.includes(job.state)) count += 1;
    }
    return count;
  }

  private schedule(): void {
    for (const job of this.jobs.values()) {
      if (this.running.size >= this.maxConcurrent) return;
      if (job.state !== "queued" || this.running.has(job.id)) continue;
      this.running.add(job.id);
      void this.execute(job).finally(() => {
        this.running.delete(job.id);
        this.schedule();
      });
    }
  }

  private transition(job: InternalExportJob, state: ExportJobState): void {
    const now = this.now();
    const previous = job.logs.at(-1);
    if (previous && previous.finishedAt === undefined) {
      previous.finishedAt = now;
      previous.durationMs = now - previous.startedAt;
      this.emit(job, {
        durationMs: previous.durationMs,
        event: "export.stage",
        stage: previous.stage,
        state: "completed",
        timestamp: now,
      });
    }
    job.state = state;
    job.updatedAt = now;
    if (!["succeeded", "failed", "cancelled", "expired"].includes(state)) {
      job.logs.push({ stage: state, startedAt: now });
      this.emit(job, {
        event: "export.stage",
        stage: state,
        state: "started",
        timestamp: now,
      });
    }
  }

  private emit(
    job: InternalExportJob,
    event: Omit<ExportLogEvent, "attempt" | "jobId" | "traceId">,
  ): void {
    try {
      this.logger({
        attempt: job.attempt,
        jobId: job.id,
        traceId: job.traceId,
        ...event,
      });
    } catch {
      // Logging must never change the export result.
    }
  }

  private ensureActive(job: InternalExportJob): void {
    if (job.timeoutRequested) throw new JobError("timeout", "Export job exceeded its time limit.");
    if (job.cancelRequested) throw new JobError("cancelled", "Export job was cancelled.");
  }

  private persist(job: InternalExportJob, artifact?: Uint8Array, thumbnail?: Uint8Array): void {
    this.storage.save({
      ...(artifact ? { artifact } : {}),
      job: copyJob(job),
      request: job.request,
      ...(thumbnail ? { thumbnail } : {}),
    });
  }

  private restorePersistedJobs(): void {
    for (const record of this.storage.load()) {
      if (this.jobs.has(record.job.id) || this.idempotency.has(record.job.idempotencyKey)) {
        continue;
      }
      const job: InternalExportJob = {
        ...record.job,
        cancelRequested: false,
        request: record.request,
        requestFingerprint: fingerprintRequest(record.request),
        timeoutRequested: false,
      };
      this.jobs.set(job.id, job);
      this.idempotency.set(job.idempotencyKey, job.id);
      if (record.artifact) this.artifacts.set(job.id, new Uint8Array(record.artifact));
      if (record.thumbnail) this.thumbnails.set(job.id, new Uint8Array(record.thumbnail));

      if (!["queued", "compiling", "rendering", "packaging"].includes(job.state)) continue;
      job.state = "queued";
      job.updatedAt = this.now();
      this.persist(job);
    }
    this.schedule();
  }

  private safePersist(job: InternalExportJob): void {
    try {
      this.persist(job);
    } catch {
      // The in-memory lifecycle remains available; a subsequent process will fail closed.
    }
  }

  private async execute(job: InternalExportJob): Promise<void> {
    if (job.state !== "queued") return;
    if (job.cancelRequested) {
      this.transition(job, "cancelled");
      this.safePersist(job);
      return;
    }

    const abortController = new AbortController();
    job.abortController = abortController;
    const timeout = setTimeout(() => {
      job.timeoutRequested = true;
      job.cancelRequested = true;
      abortController.abort();
    }, this.timeoutMs);
    let workspaceDir: string | undefined;

    try {
      workspaceDir = await mkdtemp(join(tmpdir(), "markdown-mint-export-"));
      this.transition(job, "compiling");
      const compiled = await this.compiler(job.request.source.markdown, {
        assets: job.request.source.assets,
        codeTheme: job.request.appearance.codeTheme,
        resolveResources: true,
        resourcePolicy: { allowRemote: false },
        signal: abortController.signal,
      });
      job.diagnostics = compiled.diagnostics;
      this.ensureActive(job);
      if (compiled.diagnostics.some((diagnostic) => diagnostic.level === "error")) {
        throw new JobError(
          "compile-diagnostics",
          "Document compilation returned blocking diagnostics.",
        );
      }

      this.transition(job, "rendering");
      const bundle = this.themeBundles.find(
        (candidate) => candidate.manifest.id === job.request.appearance.themeId,
      );
      if (!bundle) throw new JobError("theme-not-found", "Requested theme is not available.");
      const bundleValidation = validateThemeBundle(bundle);
      if (!bundleValidation.valid)
        throw new JobError("theme-invalid", "Requested theme failed its contract validation.");
      if (!bundle.manifest.outputs.includes(job.request.output.format)) {
        throw new JobError(
          "format-not-supported",
          "Requested theme does not support this output format.",
        );
      }

      const overrides = job.request.appearance.accentColor
        ? { "--mm-color-accent": job.request.appearance.accentColor }
        : {};
      const themed = createThemeCss(bundle, overrides);
      if (themed.issues.length > 0)
        throw new JobError("theme-overrides", "Theme overrides failed validation.");
      const title = titleForRequest(job.request, compiled);
      this.ensureActive(job);

      let bytes: Uint8Array;
      let artifact: ExportArtifact;
      let thumbnail: Uint8Array | undefined;
      if (job.request.output.format === "html") {
        const author = compiled.metadata.author ?? job.request.document.author;
        const subtitle = compiled.metadata.subtitle ?? job.request.document.subtitle;
        const bodyHtml = createDocumentBodyHtml({
          bodyHtml: compiled.html,
          features: job.request.features,
          headerText: title,
          title,
          toc: compiled.toc,
          ...(author ? { author, footerText: author } : {}),
          ...(subtitle ? { subtitle } : {}),
        });
        const html = createStandaloneHtml({
          bodyHtml: inlineResourceReferences(bodyHtml, compiled, job.request.source.assets),
          css: themed.css,
          language: compiled.metadata.language,
          title,
        });
        bytes = new TextEncoder().encode(html);
        artifact = {
          fileName: `${safeFileName(title)}.html`,
          format: "html",
          mediaType: "text/html; charset=utf-8",
          sha256: sha256(bytes),
          sizeBytes: bytes.byteLength,
        };
      } else {
        const rendered = await this.pdfRenderer({
          compiled,
          css: themed.css,
          request: job.request,
          signal: abortController.signal,
          title,
          workspaceDir,
        });
        bytes = rendered.bytes;
        this.ensureActive(job);
        thumbnail =
          rendered.thumbnail && rendered.thumbnail.byteLength > 0
            ? new Uint8Array(rendered.thumbnail)
            : undefined;
        artifact = {
          fileName: `${safeFileName(title)}.pdf`,
          format: "pdf",
          mediaType: "application/pdf",
          pageCount: rendered.pageCount,
          sha256: sha256(bytes),
          sizeBytes: bytes.byteLength,
          ...(thumbnail
            ? {
                thumbnail: {
                  fileName: `${safeFileName(title)}-thumbnail.png`,
                  mediaType: "image/png" as const,
                  sha256: sha256(thumbnail),
                  sizeBytes: thumbnail.byteLength,
                },
              }
            : {}),
        };
      }

      this.transition(job, "packaging");
      this.ensureActive(job);
      this.artifacts.set(job.id, bytes);
      if (thumbnail) this.thumbnails.set(job.id, thumbnail);
      job.artifact = artifact;
      if (workspaceDir) {
        await rm(workspaceDir, { force: true, recursive: true }).catch(() => undefined);
        workspaceDir = undefined;
      }
      this.transition(job, "succeeded");
      this.persist(job, bytes, thumbnail);
    } catch (error) {
      const jobError =
        error instanceof JobError
          ? error
          : isAbortError(error)
            ? job.timeoutRequested
              ? new JobError("timeout", "Export job exceeded its time limit.")
              : new JobError("cancelled", "Export job was cancelled.")
            : error instanceof PdfRendererError
              ? new JobError(error.code, error.message)
              : error instanceof ExportStorageError
                ? new JobError(error.code, error.message)
                : new JobError("internal-error", "Export job failed.");
      if (workspaceDir) {
        await rm(workspaceDir, { force: true, recursive: true }).catch(() => undefined);
        workspaceDir = undefined;
      }
      this.artifacts.delete(job.id);
      this.thumbnails.delete(job.id);
      delete job.artifact;
      job.error = { code: jobError.code, message: jobError.message };
      if (jobError.code === "cancelled" || jobError.code === "timeout") {
        job.state = jobError.code === "timeout" ? "failed" : "cancelled";
      } else {
        job.state = "failed";
      }
      job.updatedAt = this.now();
      const previous = job.logs.at(-1);
      if (previous && previous.finishedAt === undefined) {
        previous.finishedAt = job.updatedAt;
        previous.durationMs = job.updatedAt - previous.startedAt;
        this.emit(job, {
          durationMs: previous.durationMs,
          event: "export.stage",
          stage: previous.stage,
          state: "completed",
          timestamp: job.updatedAt,
        });
      }
      this.emit(job, {
        errorCode: jobError.code,
        event: "export.failed",
        stage: job.state,
        timestamp: job.updatedAt,
      });
      this.safePersist(job);
    } finally {
      clearTimeout(timeout);
      delete job.abortController;
      if (workspaceDir)
        await rm(workspaceDir, { force: true, recursive: true }).catch(() => undefined);
    }
  }
}

function configuredEnvInt(name: string, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

function normalizeTraceId(value: string): string {
  const candidate = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(candidate) ? candidate : randomUUID();
}

function safeFileName(value: string): string {
  const result = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return result || "markdown-mint-document";
}
