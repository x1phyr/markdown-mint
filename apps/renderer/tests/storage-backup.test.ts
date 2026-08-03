import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ExportJob } from "../src/jobs.js";
import { FileExportStorage } from "../src/storage.js";
import {
  createBackup,
  restoreBackup,
  StorageBackupError,
  verifyBackup,
} from "../scripts/storage-backup.mjs";

function request() {
  return {
    appearance: { codeTheme: "github-light", density: "normal", themeId: "technical-mint" },
    document: { language: "en", title: "Storage backup" },
    features: { cover: false, footer: false, header: false, pageNumber: false, toc: false },
    output: { format: "pdf" as const },
    page: { margin: "normal", orientation: "portrait", size: "A4" },
    source: { assets: [], markdown: "# Storage backup" },
  };
}

function succeededJob(id = randomUUID()): ExportJob {
  const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
  return {
    artifact: {
      fileName: "storage-backup.pdf",
      format: "pdf",
      mediaType: "application/pdf",
      pageCount: 1,
      sha256: "".padEnd(64, "0"),
      sizeBytes: bytes.byteLength,
    },
    attempt: 1,
    createdAt: 100,
    diagnostics: [],
    id,
    idempotencyKey: "storage-backup-test",
    logs: [],
    state: "succeeded",
    traceId: "storage-backup-test",
    updatedAt: 100,
  };
}

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "markdown-mint-storage-backup-test-"));
  try {
    await run(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

describe("renderer storage backup", () => {
  it("creates, verifies, and restores a hash-checked storage archive", async () => {
    await withRoot(async (root) => {
      const dataDir = join(root, "data");
      const restoredDir = join(root, "restored");
      const archivePath = join(root, "renderer-data.tgz");
      const storage = new FileExportStorage(dataDir);
      const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
      const job = succeededJob();
      job.artifact = {
        ...job.artifact!,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
      storage.save({ artifact: bytes, job, request: request() });

      const created = createBackup(dataDir, archivePath);
      expect(created.entries).toHaveLength(2);
      expect(verifyBackup(archivePath)).toEqual(created);

      restoreBackup(archivePath, restoredDir);
      const restored = new FileExportStorage(restoredDir).load();
      expect(restored).toHaveLength(1);
      expect(restored[0]?.job.id).toBe(job.id);
      expect(restored[0]?.artifact).toEqual(bytes);
    });
  });

  it("rejects a non-empty target unless force is explicit", async () => {
    await withRoot(async (root) => {
      const dataDir = join(root, "data");
      const targetDir = join(root, "target");
      const archivePath = join(root, "renderer-data.tgz");
      new FileExportStorage(dataDir);
      createBackup(dataDir, archivePath);
      await mkdir(targetDir, { recursive: true });
      await writeFile(join(targetDir, "unexpected.txt"), "keep me");

      expect(() => restoreBackup(archivePath, targetDir)).toThrow(StorageBackupError);
      await expect(readFile(join(targetDir, "unexpected.txt"), "utf8")).resolves.toBe("keep me");

      await rm(join(targetDir, "unexpected.txt"));
      new FileExportStorage(targetDir);
      restoreBackup(archivePath, targetDir, { force: true });
      expect(new FileExportStorage(targetDir).load()).toHaveLength(0);
    });
  });

  it("rejects symlinks in untrusted archives before extraction", async () => {
    await withRoot(async (root) => {
      const stageDir = join(root, "stage");
      const archivePath = join(root, "malicious.tgz");
      await mkdir(join(stageDir, "jobs"), { recursive: true });
      await mkdir(join(stageDir, "artifacts"), { recursive: true });
      await mkdir(join(stageDir, "thumbnails"), { recursive: true });
      await writeFile(
        join(stageDir, "manifest.json"),
        '{"archiveVersion":1,"createdAt":"now","entries":[]}',
      );
      await symlink("../../outside", join(stageDir, "jobs", `${randomUUID()}.json`));
      execFileSync("tar", [
        "-czf",
        archivePath,
        "-C",
        stageDir,
        "manifest.json",
        "jobs",
        "artifacts",
        "thumbnails",
      ]);

      expect(() => verifyBackup(archivePath)).toThrow(/symlink|special file/u);
    });
  });
});
