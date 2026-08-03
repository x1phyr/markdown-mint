import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  type Dirent,
} from "node:fs";
import { resolve, join } from "node:path";

import {
  exportRequestSchema,
  type DocumentAsset,
  type ExportRequest,
} from "@markdown-mint/document-schema";
import type { ExportArtifact, ExportJob, ExportJobState, ExportStageLog } from "./jobs.js";

const STORAGE_VERSION = 1;
const JOB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TRACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const JOB_STATES: readonly ExportJobState[] = [
  "cancelled",
  "compiling",
  "expired",
  "failed",
  "packaging",
  "queued",
  "rendering",
  "succeeded",
];

interface SerializedDocumentAsset {
  bytes: string;
  mediaType: string;
  path: string;
}

interface SerializedExportRequest {
  appearance: ExportRequest["appearance"];
  document: ExportRequest["document"];
  features: ExportRequest["features"];
  output: ExportRequest["output"];
  page: ExportRequest["page"];
  source: {
    assets: SerializedDocumentAsset[];
    markdown: string;
  };
}

interface StoredJobEnvelope {
  job: ExportJob;
  request: SerializedExportRequest;
  version: number;
}

export interface ExportStorageRecord {
  artifact?: Uint8Array;
  job: ExportJob;
  request: ExportRequest;
  thumbnail?: Uint8Array;
}

export interface ExportStorage {
  load(): readonly ExportStorageRecord[];
  remove(jobId: string): void;
  save(record: ExportStorageRecord): void;
}

export class ExportStorageError extends Error {
  readonly code = "storage-unavailable";

  constructor(message = "Export storage operation failed.") {
    super(message);
    this.name = "ExportStorageError";
  }
}

/**
 * The default keeps unit tests and local development ephemeral. Production
 * should pass a FileExportStorage through RENDERER_DATA_DIR.
 */
export class MemoryExportStorage implements ExportStorage {
  load(): readonly ExportStorageRecord[] {
    return [];
  }

  remove(jobId: string): void {
    void jobId;
    // Intentionally ephemeral.
  }

  save(record: ExportStorageRecord): void {
    void record;
    // Intentionally ephemeral.
  }
}

/**
 * A small, backup-friendly storage adapter for a single renderer instance.
 * Metadata is JSON and request bytes are base64 encoded; large result bytes
 * stay in separate files. Each file is replaced with a same-directory rename.
 */
export class FileExportStorage implements ExportStorage {
  private readonly artifactsDir: string;
  private readonly jobsDir: string;
  private readonly rootDir: string;
  private readonly thumbnailsDir: string;

  constructor(dataDir: string) {
    const candidate = dataDir.trim();
    if (!candidate) throw new ExportStorageError("Export storage directory is required.");

    this.rootDir = resolve(candidate);
    this.jobsDir = join(this.rootDir, "jobs");
    this.artifactsDir = join(this.rootDir, "artifacts");
    this.thumbnailsDir = join(this.rootDir, "thumbnails");
    try {
      for (const directory of [this.rootDir, this.jobsDir, this.artifactsDir, this.thumbnailsDir]) {
        mkdirSync(directory, { mode: 0o700, recursive: true });
      }
    } catch {
      throw new ExportStorageError();
    }
  }

  load(): readonly ExportStorageRecord[] {
    let entries: Dirent[];
    try {
      entries = readdirSync(this.jobsDir, { withFileTypes: true });
    } catch {
      throw new ExportStorageError();
    }

    const records: ExportStorageRecord[] = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const jobId = entry.name.slice(0, -5);
      if (!JOB_ID_PATTERN.test(jobId)) continue;
      const record = this.readRecord(jobId);
      if (record) records.push(record);
    }
    return records;
  }

  save(record: ExportStorageRecord): void {
    if (!JOB_ID_PATTERN.test(record.job.id)) throw new ExportStorageError();
    if (record.job.artifact && !record.artifact) throw new ExportStorageError();
    if (record.job.artifact?.thumbnail && !record.thumbnail) throw new ExportStorageError();
    if (!record.job.artifact && (record.artifact || record.thumbnail)) {
      throw new ExportStorageError();
    }

    try {
      const metadata = JSON.stringify({
        job: record.job,
        request: serializeRequest(record.request),
        version: STORAGE_VERSION,
      } satisfies StoredJobEnvelope);
      const artifactPath = this.artifactPath(record.job.id);
      const jobPath = this.jobPath(record.job.id);
      const thumbnailPath = this.thumbnailPath(record.job.id);

      if (record.artifact && record.job.artifact) {
        assertBytesMatch(
          record.artifact,
          record.job.artifact.sha256,
          record.job.artifact.sizeBytes,
        );
        writeAtomic(artifactPath, record.artifact);
      } else {
        rmSync(artifactPath, { force: true });
      }

      if (record.thumbnail && record.job.artifact?.thumbnail) {
        assertBytesMatch(
          record.thumbnail,
          record.job.artifact.thumbnail.sha256,
          record.job.artifact.thumbnail.sizeBytes,
        );
        writeAtomic(thumbnailPath, record.thumbnail);
      } else {
        rmSync(thumbnailPath, { force: true });
      }

      writeAtomic(jobPath, metadata);
    } catch (error) {
      if (error instanceof ExportStorageError) throw error;
      throw new ExportStorageError();
    }
  }

  remove(jobId: string): void {
    if (!JOB_ID_PATTERN.test(jobId)) return;
    try {
      rmSync(this.jobPath(jobId), { force: true });
      rmSync(this.artifactPath(jobId), { force: true });
      rmSync(this.thumbnailPath(jobId), { force: true });
    } catch {
      throw new ExportStorageError();
    }
  }

  private artifactPath(jobId: string): string {
    return join(this.artifactsDir, `${jobId}.bin`);
  }

  private jobPath(jobId: string): string {
    return join(this.jobsDir, `${jobId}.json`);
  }

  private readRecord(jobId: string): ExportStorageRecord | undefined {
    try {
      const metadata = readFileSync(this.jobPath(jobId), "utf8");
      const parsed = JSON.parse(metadata) as unknown;
      if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION) return undefined;

      const job = parseJob(parsed.job);
      const request = deserializeRequest(parsed.request);
      if (!job || !request) return undefined;
      if (job.state === "expired") return undefined;
      if (job.artifact === undefined) {
        if (job.state === "succeeded") return undefined;
        return { job, request };
      }

      const artifact = readVerifiedBytes(
        this.artifactPath(jobId),
        job.artifact.sha256,
        job.artifact.sizeBytes,
      );
      if (!artifact) return undefined;
      const thumbnail = job.artifact.thumbnail
        ? readVerifiedBytes(
            this.thumbnailPath(jobId),
            job.artifact.thumbnail.sha256,
            job.artifact.thumbnail.sizeBytes,
          )
        : undefined;
      if (job.artifact.thumbnail && !thumbnail) return undefined;
      return {
        artifact,
        job,
        request,
        ...(thumbnail ? { thumbnail } : {}),
      };
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return undefined;
      if (error instanceof SyntaxError) return undefined;
      throw new ExportStorageError();
    }
  }

  private thumbnailPath(jobId: string): string {
    return join(this.thumbnailsDir, `${jobId}.png`);
  }
}

function assertBytesMatch(bytes: Uint8Array, expectedSha256: string, expectedSize: number): void {
  if (bytes.byteLength !== expectedSize || sha256(bytes) !== expectedSha256) {
    throw new ExportStorageError();
  }
}

function deserializeRequest(value: unknown): ExportRequest | undefined {
  if (!isRecord(value) || !isRecord(value.source) || !Array.isArray(value.source.assets)) {
    return undefined;
  }
  const assets: DocumentAsset[] = [];
  for (const candidate of value.source.assets) {
    if (!isRecord(candidate) || typeof candidate.bytes !== "string") return undefined;
    if (!BASE64_PATTERN.test(candidate.bytes)) return undefined;
    const bytes = new Uint8Array(Buffer.from(candidate.bytes, "base64"));
    assets.push({
      bytes,
      mediaType: candidate.mediaType as string,
      path: candidate.path as string,
    });
  }

  const result = exportRequestSchema.safeParse({
    ...value,
    source: {
      ...value.source,
      assets,
    },
  });
  return result.success ? result.data : undefined;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isState(value: unknown): value is ExportJobState {
  return typeof value === "string" && JOB_STATES.includes(value as ExportJobState);
}

function parseArtifact(value: unknown): ExportArtifact | undefined {
  if (!isRecord(value)) return undefined;
  if (
    (value.format !== "html" && value.format !== "pdf") ||
    typeof value.fileName !== "string" ||
    typeof value.mediaType !== "string" ||
    typeof value.sha256 !== "string" ||
    !SHA256_PATTERN.test(value.sha256) ||
    !isSafeInteger(value.sizeBytes) ||
    value.sizeBytes < 0
  ) {
    return undefined;
  }

  const thumbnail = value.thumbnail;
  let parsedThumbnail: NonNullable<ExportArtifact["thumbnail"]> | undefined;
  if (thumbnail !== undefined) {
    if (
      !isRecord(thumbnail) ||
      typeof thumbnail.fileName !== "string" ||
      thumbnail.mediaType !== "image/png" ||
      typeof thumbnail.sha256 !== "string" ||
      !SHA256_PATTERN.test(thumbnail.sha256) ||
      !isSafeInteger(thumbnail.sizeBytes) ||
      thumbnail.sizeBytes < 0
    ) {
      return undefined;
    }
    parsedThumbnail = {
      fileName: thumbnail.fileName as string,
      mediaType: "image/png",
      sha256: thumbnail.sha256 as string,
      sizeBytes: thumbnail.sizeBytes as number,
    };
  }

  return {
    fileName: value.fileName,
    format: value.format,
    mediaType: value.mediaType,
    ...(isSafeInteger(value.pageCount) && value.pageCount >= 0
      ? { pageCount: value.pageCount }
      : {}),
    sha256: value.sha256,
    sizeBytes: value.sizeBytes,
    ...(parsedThumbnail ? { thumbnail: parsedThumbnail } : {}),
  };
}

function parseJob(value: unknown): ExportJob | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.id !== "string" ||
    !JOB_ID_PATTERN.test(value.id) ||
    typeof value.idempotencyKey !== "string" ||
    !value.idempotencyKey.trim() ||
    typeof value.traceId !== "string" ||
    !TRACE_ID_PATTERN.test(value.traceId) ||
    !isSafeInteger(value.attempt) ||
    value.attempt < 1 ||
    !isSafeInteger(value.createdAt) ||
    !isSafeInteger(value.updatedAt) ||
    !isState(value.state) ||
    !Array.isArray(value.diagnostics) ||
    !Array.isArray(value.logs)
  ) {
    return undefined;
  }

  const logs: ExportStageLog[] = [];
  for (const candidate of value.logs) {
    if (!isRecord(candidate) || !isState(candidate.stage) || !isSafeInteger(candidate.startedAt)) {
      return undefined;
    }
    if (
      (candidate.finishedAt !== undefined && !isSafeInteger(candidate.finishedAt)) ||
      (candidate.durationMs !== undefined && !isSafeInteger(candidate.durationMs))
    ) {
      return undefined;
    }
    logs.push({
      stage: candidate.stage,
      startedAt: candidate.startedAt,
      ...(candidate.finishedAt !== undefined ? { finishedAt: candidate.finishedAt } : {}),
      ...(candidate.durationMs !== undefined ? { durationMs: candidate.durationMs } : {}),
    });
  }

  const error = value.error;
  if (
    error !== undefined &&
    (!isRecord(error) || typeof error.code !== "string" || typeof error.message !== "string")
  ) {
    return undefined;
  }
  const artifact = value.artifact === undefined ? undefined : parseArtifact(value.artifact);
  if (value.artifact !== undefined && !artifact) return undefined;
  if (value.state === "succeeded" && !artifact) return undefined;
  if (value.state !== "succeeded" && artifact) return undefined;

  return {
    attempt: value.attempt,
    createdAt: value.createdAt,
    diagnostics: value.diagnostics as ExportJob["diagnostics"],
    ...(error ? { error: { code: error.code as string, message: error.message as string } } : {}),
    id: value.id,
    idempotencyKey: value.idempotencyKey,
    logs,
    state: value.state,
    traceId: value.traceId,
    updatedAt: value.updatedAt,
    ...(artifact ? { artifact } : {}),
  };
}

function serializeRequest(request: ExportRequest): SerializedExportRequest {
  return {
    appearance: request.appearance,
    document: request.document,
    features: request.features,
    output: request.output,
    page: request.page,
    source: {
      assets: request.source.assets.map((asset) => ({
        bytes: Buffer.from(asset.bytes).toString("base64"),
        mediaType: asset.mediaType,
        path: asset.path,
      })),
      markdown: request.source.markdown,
    },
  };
}

function readVerifiedBytes(
  filePath: string,
  expectedSha256: string,
  expectedSize: number,
): Uint8Array | undefined {
  try {
    const stat = statSync(filePath);
    if (!stat.isFile() || stat.size !== expectedSize) return undefined;
    const bytes = new Uint8Array(readFileSync(filePath));
    return sha256(bytes) === expectedSha256 ? bytes : undefined;
  } catch {
    return undefined;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeAtomic(filePath: string, data: string | Uint8Array): void {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, data, { mode: 0o600 });
    renameSync(temporaryPath, filePath);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}
