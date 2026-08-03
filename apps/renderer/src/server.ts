import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createDownloadPath, verifyDownloadSignature, type DownloadKind } from "./downloads.js";
import { createHealthPayload } from "./health.js";
import { ExportJobManager, type ExportJob } from "./jobs.js";

const port = Number.parseInt(process.env.PORT ?? "4310", 10);
const host = process.env.HOST ?? "127.0.0.1";
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const corsOrigin = process.env.RENDERER_CORS_ORIGIN ?? "*";

export interface RendererServerOptions {
  downloadSigningSecret?: string;
  downloadSigningTtlSeconds?: number;
  now?: () => number;
  retentionSweepMs?: number;
}

interface ExportDownloadLinks {
  artifactUrl: string;
  expiresAt?: number;
  thumbnailUrl?: string;
}

type RendererJobPayload = ExportJob & { downloads?: ExportDownloadLinks };

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-headers": "content-type, idempotency-key, x-request-id",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-origin": corsOrigin,
    vary: "origin",
  };
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
  requestId: string = randomUUID(),
): void {
  response.writeHead(status, {
    ...corsHeaders(),
    "content-type": "application/json; charset=utf-8",
    "x-request-id": requestId,
  });
  response.end(JSON.stringify(payload));
}

function requestTraceId(request: IncomingMessage): string {
  const value = request.headers["x-request-id"];
  const candidate = (Array.isArray(value) ? value[0] : value)?.trim();
  return candidate && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(candidate)
    ? candidate
    : randomUUID();
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      const error = new Error("request_too_large");
      Object.assign(error, { code: "request-too-large" });
      throw error;
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : undefined;
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "invalid-request";
}

function createDefaultManager(): ExportJobManager {
  const retentionMs = configuredInteger(
    process.env.RENDERER_RETENTION_MS,
    60 * 60 * 1000,
    86_400_000,
  );
  const storageDir = process.env.RENDERER_DATA_DIR?.trim();
  return new ExportJobManager({
    logger: (event) => console.log(JSON.stringify(event)),
    retentionMs,
    ...(storageDir ? { storageDir } : {}),
  });
}

function configuredInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

function configuredDownloadSecret(options: RendererServerOptions): string | undefined {
  const configured =
    options.downloadSigningSecret ?? process.env.RENDERER_DOWNLOAD_SIGNING_SECRET ?? "";
  const secret = configured.trim();
  if (secret && secret.length < 32) {
    throw new Error("RENDERER_DOWNLOAD_SIGNING_SECRET must contain at least 32 characters.");
  }
  return secret || undefined;
}

function configuredDownloadTtl(options: RendererServerOptions): number {
  const configured =
    options.downloadSigningTtlSeconds ??
    Number.parseInt(process.env.RENDERER_DOWNLOAD_SIGNING_TTL_SECONDS ?? "300", 10);
  if (!Number.isSafeInteger(configured) || configured < 1 || configured > 86_400) return 300;
  return configured;
}

function configuredRetentionSweep(options: RendererServerOptions): number {
  if (
    options.retentionSweepMs !== undefined &&
    Number.isSafeInteger(options.retentionSweepMs) &&
    options.retentionSweepMs >= 1 &&
    options.retentionSweepMs <= 3_600_000
  ) {
    return options.retentionSweepMs;
  }
  return configuredInteger(process.env.RENDERER_RETENTION_SWEEP_MS, 60_000, 3_600_000);
}

function withDownloadLinks(
  job: ExportJob,
  options: {
    now: () => number;
    secret: string | undefined;
    ttlSeconds: number;
  },
): RendererJobPayload {
  if (!job.artifact) return job;
  const nowMs = options.now();
  const expiresAt = options.secret ? Math.floor(nowMs / 1000) + options.ttlSeconds : undefined;
  const signedPathOptions =
    options.secret && expiresAt !== undefined ? { expiresAt, secret: options.secret } : {};
  return {
    ...job,
    downloads: {
      artifactUrl: createDownloadPath(job.id, "artifact", signedPathOptions),
      ...(expiresAt ? { expiresAt } : {}),
      ...(job.artifact.thumbnail
        ? {
            thumbnailUrl: createDownloadPath(job.id, "thumbnail", signedPathOptions),
          }
        : {}),
    },
  };
}

function downloadAuthorized(
  url: URL,
  jobId: string,
  kind: DownloadKind,
  secret: string | undefined,
  now: () => number,
): boolean {
  if (!secret) return true;
  return verifyDownloadSignature({
    expiresAt: url.searchParams.get("expires"),
    jobId,
    kind,
    nowMs: now(),
    secret,
    signature: url.searchParams.get("signature"),
  });
}

export function createRendererServer(
  manager = createDefaultManager(),
  options: RendererServerOptions = {},
) {
  const downloadSigningSecret = configuredDownloadSecret(options);
  const downloadSigningTtlSeconds = configuredDownloadTtl(options);
  const retentionSweepMs = configuredRetentionSweep(options);
  const now = options.now ?? Date.now;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const segments = url.pathname.split("/").filter(Boolean);
    const requestId = requestTraceId(request);

    if (request.method === "OPTIONS") {
      response.writeHead(204, { ...corsHeaders(), "x-request-id": requestId });
      response.end();
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, createHealthPayload(), requestId);
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/exports") {
      try {
        const body = await readJsonBody(request);
        const key = request.headers["idempotency-key"];
        const idempotencyKey = Array.isArray(key) ? key[0] : key;
        const job = manager.submit(body, idempotencyKey, requestId);
        sendJson(
          response,
          202,
          withDownloadLinks(job, {
            now,
            secret: downloadSigningSecret,
            ttlSeconds: downloadSigningTtlSeconds,
          }),
          requestId,
        );
      } catch (error) {
        sendJson(
          response,
          400,
          {
            error: errorCode(error),
            message: "Export request was rejected.",
          },
          requestId,
        );
      }
      return;
    }

    if (segments[0] === "v1" && segments[1] === "exports" && segments[2]) {
      const jobId = segments[2];
      if (request.method === "GET" && segments.length === 3) {
        const job = manager.get(jobId);
        if (!job) sendJson(response, 404, { error: "not_found" }, requestId);
        else
          sendJson(
            response,
            200,
            withDownloadLinks(job, {
              now,
              secret: downloadSigningSecret,
              ttlSeconds: downloadSigningTtlSeconds,
            }),
            requestId,
          );
        return;
      }

      if (request.method === "POST" && segments[3] === "cancel") {
        const job = manager.cancel(jobId);
        if (!job) sendJson(response, 404, { error: "not_found" }, requestId);
        else
          sendJson(
            response,
            202,
            withDownloadLinks(job, {
              now,
              secret: downloadSigningSecret,
              ttlSeconds: downloadSigningTtlSeconds,
            }),
            requestId,
          );
        return;
      }

      if (request.method === "POST" && segments[3] === "retry") {
        const job = manager.retry(jobId);
        if (!job) sendJson(response, 404, { error: "not_found" }, requestId);
        else
          sendJson(
            response,
            202,
            withDownloadLinks(job, {
              now,
              secret: downloadSigningSecret,
              ttlSeconds: downloadSigningTtlSeconds,
            }),
            requestId,
          );
        return;
      }

      if (request.method === "GET" && segments[3] === "artifact") {
        if (!downloadAuthorized(url, jobId, "artifact", downloadSigningSecret, now)) {
          sendJson(response, 403, { error: "download_signature_invalid" }, requestId);
          return;
        }
        const job = manager.get(jobId);
        const bytes = manager.getArtifact(jobId);
        if (!job) {
          sendJson(response, 404, { error: "not_found" }, requestId);
        } else if (!bytes || !job.artifact) {
          sendJson(response, 409, { error: "artifact_not_ready", state: job.state }, requestId);
        } else {
          response.writeHead(200, {
            "content-disposition": `attachment; filename="${job.artifact.fileName}"`,
            "content-length": String(bytes.byteLength),
            "content-type": job.artifact.mediaType,
            ...corsHeaders(),
            "x-request-id": requestId,
          });
          response.end(bytes);
        }
        return;
      }

      if (request.method === "GET" && segments[3] === "thumbnail") {
        if (!downloadAuthorized(url, jobId, "thumbnail", downloadSigningSecret, now)) {
          sendJson(response, 403, { error: "download_signature_invalid" }, requestId);
          return;
        }
        const job = manager.get(jobId);
        const bytes = manager.getThumbnail(jobId);
        const thumbnail = job?.artifact?.thumbnail;
        if (!job) {
          sendJson(response, 404, { error: "not_found" }, requestId);
        } else if (!bytes || !thumbnail) {
          sendJson(response, 409, { error: "thumbnail_not_ready", state: job.state }, requestId);
        } else {
          response.writeHead(200, {
            "content-disposition": `inline; filename="${thumbnail.fileName}"`,
            "content-length": String(bytes.byteLength),
            "content-type": thumbnail.mediaType,
            ...corsHeaders(),
            "x-request-id": requestId,
          });
          response.end(bytes);
        }
        return;
      }
    }

    sendJson(response, 404, { error: "not_found" }, requestId);
  });

  const expiryTimer = setInterval(() => manager.expire(), retentionSweepMs);
  expiryTimer.unref?.();

  server.on("close", () => {
    clearInterval(expiryTimer);
    void manager.close();
  });
  return server;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const server = createRendererServer();
  server.listen(port, host, () => {
    console.log(`MarkdownMint renderer listening on http://${host}:${port}`);
  });
}
