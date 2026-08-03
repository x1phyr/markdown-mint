import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExportJob } from "../src/jobs.js";
import { FileExportStorage } from "../src/storage.js";

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "markdown-mint-storage-backup-smoke-"));
  const dataDir = join(root, "data");
  const restoredDir = join(root, "restored");
  const archivePath = join(root, "renderer-data.tgz");
  try {
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
    const id = randomUUID();
    const job: ExportJob = {
      artifact: {
        fileName: "storage-backup-smoke.pdf",
        format: "pdf",
        mediaType: "application/pdf",
        pageCount: 1,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sizeBytes: bytes.byteLength,
      },
      attempt: 1,
      createdAt: Date.now(),
      diagnostics: [],
      id,
      idempotencyKey: "storage-backup-smoke",
      logs: [],
      state: "succeeded",
      traceId: "storage-backup-smoke",
      updatedAt: Date.now(),
    };
    new FileExportStorage(dataDir).save({
      artifact: bytes,
      job,
      request: {
        appearance: { codeTheme: "github-light", density: "normal", themeId: "technical-mint" },
        document: { language: "en", title: "Storage backup smoke" },
        features: { cover: false, footer: false, header: false, pageNumber: false, toc: false },
        output: { format: "pdf" },
        page: { margin: "normal", orientation: "portrait", size: "A4" },
        source: { assets: [], markdown: "# Storage backup smoke" },
      },
    });

    const scriptPath = fileURLToPath(new URL("./storage-backup.mjs", import.meta.url));
    const created = JSON.parse(
      execFileSync(
        process.execPath,
        [scriptPath, "create", "--data-dir", dataDir, "--output", archivePath],
        {
          encoding: "utf8",
        },
      ),
    ) as { entries: number };
    const verified = JSON.parse(
      execFileSync(process.execPath, [scriptPath, "verify", "--archive", archivePath], {
        encoding: "utf8",
      }),
    ) as { entries: number };
    if (created.entries !== verified.entries) {
      throw new Error("Storage backup manifest changed during verification.");
    }
    const restored = JSON.parse(
      execFileSync(
        process.execPath,
        [scriptPath, "restore", "--archive", archivePath, "--data-dir", restoredDir],
        { encoding: "utf8" },
      ),
    ) as { entries: number };
    const restoredRecords = new FileExportStorage(restoredDir).load();
    if (restored.entries !== created.entries || restoredRecords.length !== 1) {
      throw new Error(`Storage backup restore failed: ${JSON.stringify(restoredRecords)}`);
    }

    console.log(
      JSON.stringify({
        archiveEntries: verified.entries.length,
        restoredRecords: restoredRecords.length,
        state: restoredRecords[0]?.job.state,
      }),
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

void main();
