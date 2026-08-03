import { chmod, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CompiledDocument } from "@markdown-mint/compiler";
import type { ExportRequest } from "@markdown-mint/document-schema";
import { describe, expect, it } from "vitest";

import { createFallbackPdf } from "../src/jobs.js";
import { createVivliostyleDocumentHtml } from "../src/pdf-renderer.js";
import { createVivliostylePdfRenderer } from "../src/vivliostyle-pdf-renderer.js";
import type { PdfRenderInput } from "../src/jobs.js";

const request: ExportRequest = {
  appearance: {
    accentColor: "#2f735f",
    codeTheme: "github-light",
    density: "normal",
    themeId: "technical-mint",
  },
  document: { author: "Author", language: "en", title: "Vivliostyle" },
  features: { cover: true, footer: true, header: true, pageNumber: true, toc: true },
  output: { format: "pdf" },
  page: { margin: "normal", orientation: "landscape", size: "A4" },
  source: { assets: [], markdown: "# Vivliostyle" },
};

const compiled: CompiledDocument = {
  compilerVersion: "0.1.0",
  diagnostics: [],
  html: '<h1 id="vivliostyle">Vivliostyle</h1>',
  messages: [],
  metadata: { author: "Compiled Author", language: "en", title: "Compiled title" },
  protocol: "markdown-mint/compiled-document",
  resourceManifest: { entries: [], totalBytes: 0 },
  resources: [],
  toc: [{ children: [], id: "vivliostyle", level: 1, text: "Vivliostyle" }],
  version: 1,
};

function input(overrides: Partial<PdfRenderInput> = {}): PdfRenderInput {
  return {
    compiled,
    css: ".mm-document { color: #20211f; }",
    request,
    title: "Vivliostyle",
    ...overrides,
  };
}

type FakeCli = (source: string) => Promise<string>;

async function withWorkspace<T>(
  callback: (root: string, fakeCli: FakeCli) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "markdown-mint-vivliostyle-test-"));
  const executablePaths = new Set<string>();
  const fakeCli: FakeCli = async (source) => {
    const executableRoot = process.env.VIVLIOSTYLE_TEST_EXEC_DIR ?? process.cwd();
    const path = join(executableRoot, `.fake-vivliostyle-${randomUUID()}.mjs`);
    await writeFile(path, `#!/usr/bin/env node\n${source}`, { encoding: "utf8", mode: 0o755 });
    await chmod(path, 0o755);
    executablePaths.add(path);
    return path;
  };

  try {
    return await callback(root, fakeCli);
  } finally {
    await rm(root, { force: true, recursive: true });
    await Promise.all(executablePaths.values().map((path) => rm(path, { force: true })));
  }
}

describe("Vivliostyle PDF renderer adapter", () => {
  it("creates a self-contained single-document command with paged-media margin boxes", async () => {
    await withWorkspace(async (root) => {
      let observedArgs: readonly string[] = [];
      let observedCwd = "";
      const renderer = createVivliostylePdfRenderer({
        binaryPath: "/opt/vivliostyle/bin/vivliostyle",
        commandRunner: async (_binary, args, cwd) => {
          observedArgs = args;
          observedCwd = cwd;
          const outputPath = args[args.indexOf("--output") + 1];
          if (!outputPath) throw new Error("missing output path");
          await writeFile(outputPath, createFallbackPdf("Vivliostyle"));
          return { exitCode: 0, stderr: "", stdout: "" };
        },
        thumbnailRenderer: async () => new Uint8Array([137, 80, 78, 71]),
        workspaceRoot: root,
      });

      const result = await renderer(input());
      expect(result.pageCount).toBe(1);
      expect(result.thumbnail).toEqual(new Uint8Array([137, 80, 78, 71]));
      expect(observedArgs).toEqual(
        expect.arrayContaining([
          "build",
          "--single-doc",
          "--no-enable-static-serve",
          "--size",
          "A4",
          "--output",
        ]),
      );
      expect(observedCwd).toContain(root);
      expect(await readdir(root)).toEqual([]);
    });
  });

  it("emits CSS page margin boxes and keeps resources self-contained", () => {
    const html = createVivliostyleDocumentHtml(input());
    expect(html).toContain("@top-center");
    expect(html).toContain("@bottom-left");
    expect(html).toContain('counter(page) " / " counter(pages)');
    expect(html).toContain("size: A4 landscape");
    expect(html).not.toContain("https://");
  });

  it("fails closed when the external CLI is unavailable or returns a bad exit code", async () => {
    await withWorkspace(async (root) => {
      const missing = createVivliostylePdfRenderer({
        commandRunner: async () => {
          throw Object.assign(new Error("not found"), { code: "ENOENT" });
        },
        workspaceRoot: root,
      });
      await expect(missing(input())).rejects.toMatchObject({ code: "pdf-backend-unavailable" });

      const failed = createVivliostylePdfRenderer({
        commandRunner: async () => ({ exitCode: 17, stderr: "bad CSS", stdout: "" }),
        workspaceRoot: root,
      });
      await expect(failed(input())).rejects.toMatchObject({
        code: "pdf-renderer-failed",
        message: expect.stringContaining("bad CSS"),
      });
      expect(await readdir(root)).toEqual([]);
    });
  });

  it("rejects a successful CLI process that did not create a valid PDF", async () => {
    await withWorkspace(async (root) => {
      const renderer = createVivliostylePdfRenderer({
        commandRunner: async (_binary, args) => {
          const outputPath = args[args.indexOf("--output") + 1];
          if (!outputPath) throw new Error("missing output path");
          await writeFile(outputPath, new Uint8Array());
          return { exitCode: 0, stderr: "", stdout: "" };
        },
        workspaceRoot: root,
      });
      await expect(renderer(input())).rejects.toMatchObject({ code: "pdf-renderer-invalid" });
      expect(await readdir(root)).toEqual([]);
    });
  });

  it("runs a real external process, captures its output, and forwards audited browser settings", async () => {
    await withWorkspace(async (root, fakeCli) => {
      const previousBrowser = process.env.VIVLIOSTYLE_BROWSER;
      const previousExecutable = process.env.VIVLIOSTYLE_BROWSER_EXECUTABLE;
      process.env.VIVLIOSTYLE_BROWSER = "chrome@151";
      process.env.VIVLIOSTYLE_BROWSER_EXECUTABLE = "/opt/chromium/chrome";
      try {
        const binaryPath = await fakeCli(
          'import { writeFileSync } from "node:fs"; const index = process.argv.indexOf("--output"); writeFileSync(process.argv[index + 1], Buffer.from("%PDF-1.7\\n/Type /Page\\n%%EOF")); console.log("vivliostyle ok"); process.exit(0);',
        );
        const renderer = createVivliostylePdfRenderer({
          binaryPath,
          thumbnailRenderer: async () => undefined,
          timeoutMs: 5_000,
          workspaceRoot: root,
        });
        const result = await renderer(input());
        expect(result.pageCount).toBe(1);
        await renderer.close?.();
      } finally {
        if (previousBrowser === undefined) delete process.env.VIVLIOSTYLE_BROWSER;
        else process.env.VIVLIOSTYLE_BROWSER = previousBrowser;
        if (previousExecutable === undefined) delete process.env.VIVLIOSTYLE_BROWSER_EXECUTABLE;
        else process.env.VIVLIOSTYLE_BROWSER_EXECUTABLE = previousExecutable;
      }
    });
  });

  it("maps real CLI spawn, timeout, and output failures to stable renderer errors", async () => {
    await withWorkspace(async (root, fakeCli) => {
      const missing = createVivliostylePdfRenderer({
        binaryPath: join(root, "missing-vivliostyle"),
        thumbnailRenderer: async () => undefined,
        workspaceRoot: root,
      });
      await expect(missing(input())).rejects.toMatchObject({ code: "pdf-backend-unavailable" });

      const failedPath = await fakeCli('console.error("bad CSS"); process.exit(17);');
      const failed = createVivliostylePdfRenderer({
        binaryPath: failedPath,
        thumbnailRenderer: async () => undefined,
        workspaceRoot: root,
      });
      await expect(failed(input())).rejects.toMatchObject({
        code: "pdf-renderer-failed",
        message: expect.stringContaining("bad CSS"),
      });

      const timeoutPath = await fakeCli("setTimeout(() => {}, 5_000);");
      const timedOut = createVivliostylePdfRenderer({
        binaryPath: timeoutPath,
        thumbnailRenderer: async () => undefined,
        timeoutMs: 20,
        workspaceRoot: root,
      });
      await expect(timedOut(input())).rejects.toMatchObject({
        code: "pdf-renderer-failed",
        message: expect.stringContaining("timeout"),
      });
      expect(await readdir(root)).toEqual([]);
    });
  });

  it("rejects a CLI that exits successfully without producing a PDF page", async () => {
    await withWorkspace(async (root, fakeCli) => {
      const binaryPath = await fakeCli(
        'const index = process.argv.indexOf("--output"); process.stdout.write("no artifact");',
      );
      const renderer = createVivliostylePdfRenderer({
        binaryPath,
        thumbnailRenderer: async () => undefined,
        workspaceRoot: root,
      });
      await expect(renderer(input())).rejects.toMatchObject({ code: "pdf-renderer-invalid" });
      expect(await readdir(root)).toEqual([]);
    });
  });

  it("preserves generic process and workspace setup failures as actionable backend errors", async () => {
    await withWorkspace(async (root) => {
      const generic = createVivliostylePdfRenderer({
        commandRunner: async () => {
          throw "unexpected process failure";
        },
        thumbnailRenderer: async () => undefined,
        workspaceRoot: root,
      });
      await expect(generic(input())).rejects.toMatchObject({
        code: "pdf-renderer-failed",
        message: expect.stringContaining("Unknown CLI process error"),
      });

      const missingRoot = createVivliostylePdfRenderer({
        thumbnailRenderer: async () => undefined,
        workspaceRoot: join(root, "missing-parent"),
      });
      await expect(missingRoot(input())).rejects.toMatchObject({
        code: "pdf-renderer-failed",
        message: expect.stringContaining("Vivliostyle PDF rendering failed"),
      });
    });
  });
});
