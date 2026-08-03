import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createFallbackPdf, type ExportJob } from "../src/jobs.js";
import { ExportJobManager } from "../src/jobs.js";
import { ExportStorageError, FileExportStorage } from "../src/storage.js";

function request(markdown = "# Persistent document", format: "html" | "pdf" = "html") {
  return {
    appearance: {
      codeTheme: "github-light",
      density: "normal",
      themeId: "technical-mint",
    },
    document: { language: "en", title: "Persistent document" },
    features: { cover: true, footer: true, header: false, pageNumber: true, toc: true },
    output: { format },
    page: { margin: "normal", orientation: "portrait", size: "A4" },
    source: { assets: [], markdown },
  };
}

function queuedJob(id = randomUUID(), idempotencyKey = "queued-record"): ExportJob {
  return {
    attempt: 1,
    createdAt: 100,
    diagnostics: [],
    id,
    idempotencyKey,
    logs: [],
    state: "queued",
    traceId: "storage-test",
    updatedAt: 100,
  };
}

function serializedRequest() {
  return {
    ...request(),
    source: { assets: [], markdown: "# Serialized request" },
  };
}

async function writeRawRecord(
  directory: string,
  changes: Record<string, unknown> = {},
  storedRequest = serializedRequest(),
): Promise<string> {
  const fileId = randomUUID();
  const job = { ...queuedJob(fileId), ...changes };
  await writeFile(
    join(directory, "jobs", `${fileId}.json`),
    JSON.stringify({ job, request: storedRequest, version: 1 }),
  );
  return fileId;
}

async function withStorage(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "markdown-mint-storage-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

describe("FileExportStorage", () => {
  it("restores terminal artifacts and idempotency across manager instances", async () => {
    await withStorage(async (directory) => {
      const firstManager = new ExportJobManager({ storageDir: directory });
      const submitted = firstManager.submit(request(), "persisted-idempotency", "persisted-trace");
      const completed = await firstManager.waitFor(submitted.id);
      const firstArtifact = firstManager.getArtifact(submitted.id);
      await firstManager.close();

      expect(completed?.state).toBe("succeeded");
      expect(firstArtifact).toBeDefined();

      const restoredManager = new ExportJobManager({ storageDir: directory });
      const restored = restoredManager.get(submitted.id);
      const duplicate = restoredManager.submit(request(), "persisted-idempotency");

      expect(restored?.state).toBe("succeeded");
      expect(restored?.traceId).toBe("persisted-trace");
      expect(duplicate.id).toBe(submitted.id);
      expect(restoredManager.getArtifact(submitted.id)).toEqual(firstArtifact);
      await restoredManager.close();
    });
  });

  it("requeues a persisted request after an interrupted process", async () => {
    await withStorage(async (directory) => {
      const id = randomUUID();
      const queued: ExportJob = {
        attempt: 1,
        createdAt: 100,
        diagnostics: [],
        id,
        idempotencyKey: "recover-queued",
        logs: [],
        state: "queued",
        traceId: "recover-trace",
        updatedAt: 100,
      };
      new FileExportStorage(directory).save({ job: queued, request: request("# Recover me") });

      const manager = new ExportJobManager({ storageDir: directory });
      const recovered = await manager.waitFor(id);

      expect(recovered?.state).toBe("succeeded");
      expect(new TextDecoder().decode(manager.getArtifact(id))).toContain("Recover me");
      await manager.close();
    });
  });

  it("persists PDF thumbnails and removes the complete record at expiry", async () => {
    await withStorage(async (directory) => {
      let now = 100;
      const thumbnail = new Uint8Array([137, 80, 78, 71]);
      const firstManager = new ExportJobManager({
        now: () => now,
        pdfRenderer: async ({ title }) => ({
          bytes: createFallbackPdf(title),
          pageCount: 1,
          thumbnail,
        }),
        retentionMs: 10,
        storageDir: directory,
      });
      const submitted = firstManager.submit(request("# Persisted PDF", "pdf"), "persisted-pdf");
      await firstManager.waitFor(submitted.id);
      await firstManager.close();

      const restoredManager = new ExportJobManager({
        now: () => now,
        pdfRenderer: async ({ title }) => ({
          bytes: createFallbackPdf(title),
          pageCount: 1,
          thumbnail,
        }),
        retentionMs: 10,
        storageDir: directory,
      });
      expect(restoredManager.getThumbnail(submitted.id)).toEqual(thumbnail);
      now += 11;
      restoredManager.expire();
      expect(restoredManager.get(submitted.id)?.state).toBe("expired");
      await restoredManager.close();

      const afterExpiry = new FileExportStorage(directory);
      expect(afterExpiry.load()).toEqual([]);
      afterExpiry.remove("not-a-uuid");
    });
  });

  it("ignores malformed metadata and rejects unsafe storage writes", async () => {
    await withStorage(async (directory) => {
      const storage = new FileExportStorage(directory);
      await writeFile(join(directory, "jobs", "not-a-job.json"), "{}");
      await writeFile(join(directory, "jobs", `${randomUUID()}.json`), "{");
      await mkdir(join(directory, "jobs", `${randomUUID()}.json`));
      await writeFile(join(directory, "jobs", "ignored.txt"), "{}");

      await writeRawRecord(directory, { id: "not-a-uuid" });
      await writeRawRecord(directory, { idempotencyKey: "" });
      await writeRawRecord(directory, { traceId: "" });
      await writeRawRecord(directory, { attempt: 0 });
      await writeRawRecord(directory, { createdAt: "invalid" });
      await writeRawRecord(directory, { state: "invalid" });
      await writeRawRecord(directory, { diagnostics: "invalid" });
      await writeRawRecord(directory, { logs: "invalid" });
      await writeRawRecord(directory, { logs: [{ stage: "invalid", startedAt: 1 }] });
      await writeRawRecord(directory, { logs: [{ stage: "queued", startedAt: "invalid" }] });
      await writeRawRecord(directory, { error: { code: 1, message: "invalid" } });
      await writeRawRecord(directory, { state: "succeeded" });
      await writeRawRecord(directory, { state: "failed", artifact: { format: "pdf" } });
      await writeRawRecord(
        directory,
        {},
        {
          ...serializedRequest(),
          source: {
            assets: [{ bytes: "!!!!", mediaType: "image/png", path: "bad.png" }],
            markdown: "# Invalid asset encoding",
          },
        },
      );

      expect(storage.load()).toEqual([]);

      const bytes = createFallbackPdf("Storage validation");
      const validArtifact = {
        fileName: "storage.pdf",
        format: "pdf" as const,
        mediaType: "application/pdf",
        pageCount: 1,
        sha256: "0".repeat(64),
        sizeBytes: bytes.byteLength,
      };
      const validJob: ExportJob = {
        ...queuedJob(randomUUID(), "validation"),
        artifact: validArtifact,
        state: "succeeded",
      };
      expect(() => storage.save({ job: validJob, request: request("# x", "pdf") })).toThrow(
        ExportStorageError,
      );
      expect(() => storage.save({ job: queuedJob("bad-id"), request: request() })).toThrow(
        ExportStorageError,
      );
      expect(() => storage.save({ job: queuedJob(), request: request(), artifact: bytes })).toThrow(
        ExportStorageError,
      );
    });
  });

  it("fails closed when a persisted artifact is missing", async () => {
    await withStorage(async (directory) => {
      const manager = new ExportJobManager({ storageDir: directory });
      const submitted = manager.submit(request(), "missing-artifact");
      await manager.waitFor(submitted.id);
      await manager.close();

      await rm(join(directory, "artifacts", `${submitted.id}.bin`), { force: true });
      const restoredManager = new ExportJobManager({ storageDir: directory });

      expect(restoredManager.get(submitted.id)).toBeUndefined();
      expect(restoredManager.getArtifact(submitted.id)).toBeUndefined();
      await restoredManager.close();
    });
  });
});
