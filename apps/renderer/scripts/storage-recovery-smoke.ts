import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ExportJobManager, type ExportJob } from "../src/jobs.js";
import { FileExportStorage } from "../src/storage.js";

function createPng(width = 2, height = 2): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes[19] = width;
  bytes[23] = height;
  return bytes;
}

function createRequest(markdown = "# Storage recovery smoke") {
  return {
    appearance: {
      codeTheme: "github-light",
      density: "normal",
      themeId: "technical-mint",
    },
    document: { language: "en", title: "Storage recovery smoke" },
    features: { cover: false, footer: false, header: false, pageNumber: false, toc: false },
    output: { format: "html" as const },
    page: { margin: "normal", orientation: "portrait", size: "A4" },
    source: {
      assets: [{ bytes: createPng(), mediaType: "image/png", path: "smoke.png" }],
      markdown,
    },
  };
}

function queuedJob(id: string): ExportJob {
  return {
    attempt: 1,
    createdAt: Date.now(),
    diagnostics: [],
    id,
    idempotencyKey: "storage-queued-recovery",
    logs: [],
    state: "queued",
    traceId: "storage-recovery-smoke",
    updatedAt: Date.now(),
  };
}

async function main(): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), "markdown-mint-storage-smoke-"));
  try {
    const firstManager = new ExportJobManager({ storageDir: dataDir });
    const submitted = firstManager.submit(createRequest(), "storage-terminal-recovery");
    const completed = await firstManager.waitFor(submitted.id);
    const artifact = firstManager.getArtifact(submitted.id);
    if (completed?.state !== "succeeded" || !artifact) {
      throw new Error(`Initial storage smoke failed: ${JSON.stringify(completed)}`);
    }
    await firstManager.close();

    const secondManager = new ExportJobManager({ storageDir: dataDir });
    const restored = secondManager.get(submitted.id);
    const duplicate = secondManager.submit(createRequest(), "storage-terminal-recovery");
    if (restored?.state !== "succeeded" || duplicate.id !== submitted.id) {
      throw new Error(`Terminal recovery failed: ${JSON.stringify({ restored, duplicate })}`);
    }
    await secondManager.close();

    const queuedId = randomUUID();
    new FileExportStorage(dataDir).save({
      job: queuedJob(queuedId),
      request: createRequest("# Queued recovery smoke"),
    });
    const thirdManager = new ExportJobManager({ storageDir: dataDir });
    const recoveredQueued = await thirdManager.waitFor(queuedId);
    if (recoveredQueued?.state !== "succeeded") {
      throw new Error(`Queued recovery failed: ${JSON.stringify(recoveredQueued)}`);
    }

    console.log(
      JSON.stringify({
        artifactBytes: artifact.byteLength,
        recoveredQueuedId: queuedId,
        restoredJobId: submitted.id,
        state: recoveredQueued.state,
        storedRecords: new FileExportStorage(dataDir).load().length,
      }),
    );
    await thirdManager.close();
  } finally {
    await rm(dataDir, { force: true, recursive: true });
  }
}

void main();
