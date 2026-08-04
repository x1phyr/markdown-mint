import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import type { CompiledDocument } from "@markdown-mint/compiler";
import { launchThemeBundles } from "@markdown-mint/themes";

import { createFallbackPdf, ExportJobManager } from "../src/jobs.js";
import { createChromiumPdfRenderer } from "../src/pdf-renderer.js";

function request(format: "html" | "pdf" = "html") {
  return {
    appearance: {
      accentColor: "#2f735f",
      codeTheme: "github-light",
      density: "normal",
      themeId: "technical-mint",
    },
    document: { author: "Test", language: "en", title: "Smoke document" },
    features: { cover: true, footer: true, header: false, pageNumber: true, toc: true },
    output: { format },
    page: { margin: "normal", orientation: "portrait", size: "A4" },
    source: { assets: [], markdown: "# Smoke\n\nHello." },
  };
}

function createPng(width = 2, height = 2): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes[19] = width;
  bytes[23] = height;
  return bytes;
}

describe("ExportJobManager", () => {
  it("renders the complex theme fixture as a standalone offline HTML artifact", async () => {
    const fixture = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/p5-themes.md"),
      "utf8",
    );
    const manager = new ExportJobManager();
    const job = manager.submit(
      {
        ...request(),
        source: {
          assets: [{ bytes: createPng(), mediaType: "image/png", path: "theme-sample.png" }],
          markdown: fixture,
        },
      },
      "complex-theme-fixture",
    );
    const completed = await manager.waitFor(job.id);
    const html = new TextDecoder().decode(manager.getArtifact(job.id));

    expect(completed?.state).toBe("succeeded");
    expect(html).toContain("fixtureLine100");
    expect(html).toContain("mm-callout");
    expect(html).toContain("mm-mermaid-");
    expect(html).toContain("katex");
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain("./theme-sample.png");
  });

  it("runs the HTML smoke path and preserves idempotency", async () => {
    const manager = new ExportJobManager();
    const first = manager.submit(request(), "smoke-1");
    const duplicate = manager.submit(request(), "smoke-1");
    const completed = await manager.waitFor(first.id);

    expect(duplicate.id).toBe(first.id);
    expect(completed?.state).toBe("succeeded");
    expect(completed?.artifact).toEqual(
      expect.objectContaining({ format: "html", mediaType: "text/html; charset=utf-8" }),
    );
    expect(new TextDecoder().decode(manager.getArtifact(first.id))).toContain("<!doctype html>");
  });

  it("embeds local image assets in standalone HTML output", async () => {
    const manager = new ExportJobManager();
    const job = manager.submit(
      {
        ...request(),
        source: {
          assets: [{ bytes: createPng(), mediaType: "image/png", path: "cover.png" }],
          markdown: "# Offline HTML\n\n![Cover](./cover.png)",
        },
      },
      "html-offline-assets",
    );
    await manager.waitFor(job.id);

    const html = new TextDecoder().decode(manager.getArtifact(job.id));
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain("assets/asset-");
  });

  it("produces a valid deterministic fallback PDF artifact", async () => {
    const thumbnail = new Uint8Array([137, 80, 78, 71]);
    const manager = new ExportJobManager({
      pdfRenderer: async ({ title }) => ({
        bytes: createFallbackPdf(title),
        pageCount: 1,
        thumbnail,
      }),
    });
    const job = manager.submit(request("pdf"), "smoke-pdf");
    const completed = await manager.waitFor(job.id);
    const bytes = manager.getArtifact(job.id);

    expect(completed?.state).toBe("succeeded");
    expect(completed?.artifact?.format).toBe("pdf");
    expect(completed?.artifact?.thumbnail).toEqual(
      expect.objectContaining({
        fileName: "Smoke-thumbnail.png",
        mediaType: "image/png",
        sizeBytes: thumbnail.byteLength,
      }),
    );
    expect(new TextDecoder().decode(bytes?.slice(0, 8))).toContain("%PDF-1.4");
    expect(manager.getThumbnail(job.id)).toEqual(thumbnail);
    expect(createFallbackPdf("Smoke")).toEqual(createFallbackPdf("Smoke"));

    const escaped = new TextDecoder().decode(createFallbackPdf("A (B) \\ 中文"));
    expect(escaped).toContain("A \\(B\\) \\\\ ??");
  });

  it("marks timeout as a stable failure and supports bounded retry", async () => {
    const compiled: CompiledDocument = {
      compilerVersion: "0.1.0",
      diagnostics: [],
      html: "<h1>Smoke</h1>",
      messages: [],
      metadata: { language: "en", title: "Smoke" },
      protocol: "markdown-mint/compiled-document",
      resourceManifest: { entries: [], totalBytes: 0 },
      resources: [],
      toc: [],
      version: 1,
    };
    let attempts = 0;
    const manager = new ExportJobManager({
      compiler: async () => {
        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, attempts === 1 ? 20 : 0));
        return compiled;
      },
      maxAttempts: 2,
      timeoutMs: 5,
    });

    const job = manager.submit(request(), "retry-1");
    const failed = await manager.waitFor(job.id);
    expect(failed?.state).toBe("failed");
    expect(failed?.error).toEqual(expect.objectContaining({ code: "timeout" }));

    const retried = manager.retry(job.id);
    const completed = await manager.waitFor(job.id);
    expect(retried?.attempt).toBe(2);
    expect(completed?.state).toBe("succeeded");
  });

  it("cancels a running job without exposing an artifact", async () => {
    const manager = new ExportJobManager({
      compiler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          compilerVersion: "0.1.0",
          diagnostics: [],
          html: "<h1>Cancelled</h1>",
          messages: [],
          metadata: { language: "en", title: "Cancelled" },
          protocol: "markdown-mint/compiled-document",
          resourceManifest: { entries: [], totalBytes: 0 },
          resources: [],
          toc: [],
          version: 1,
        } satisfies CompiledDocument;
      },
    });
    const job = manager.submit(request(), "cancel-1");
    manager.cancel(job.id);
    const cancelled = await manager.waitFor(job.id);

    expect(cancelled?.state).toBe("cancelled");
    expect(manager.getArtifact(job.id)).toBeUndefined();
  });

  it("keeps concurrent success and failure artifacts isolated", async () => {
    const compiled: CompiledDocument = {
      compilerVersion: "0.1.0",
      diagnostics: [],
      html: "<h1>Concurrent</h1>",
      messages: [],
      metadata: { language: "en", title: "Concurrent" },
      protocol: "markdown-mint/compiled-document",
      resourceManifest: { entries: [], totalBytes: 0 },
      resources: [],
      toc: [],
      version: 1,
    };
    const manager = new ExportJobManager({
      compiler: async (markdown) => {
        await new Promise((resolve) => setTimeout(resolve, markdown.includes("slow") ? 8 : 1));
        if (markdown.includes("fail")) throw new Error("synthetic failure");
        return compiled;
      },
    });
    const success = manager.submit(
      { ...request(), source: { assets: [], markdown: "slow success" } },
      "concurrent-success",
    );
    const failure = manager.submit(
      { ...request(), source: { assets: [], markdown: "fail" } },
      "concurrent-failure",
    );

    const [completedSuccess, completedFailure] = await Promise.all([
      manager.waitFor(success.id),
      manager.waitFor(failure.id),
    ]);
    expect(completedSuccess?.state).toBe("succeeded");
    expect(completedFailure?.state).toBe("failed");
    expect(manager.getArtifact(success.id)).toBeDefined();
    expect(manager.getArtifact(failure.id)).toBeUndefined();
  });

  it("returns stable validation and missing-job errors", () => {
    const manager = new ExportJobManager();
    expect(() => manager.submit({}, "invalid")).toThrow("Export request failed schema validation");
    expect(() => manager.submit(request(), "   ")).toThrow("idempotency key");
    expect(manager.get("missing")).toBeUndefined();
    expect(manager.getArtifact("missing")).toBeUndefined();
    expect(manager.cancel("missing")).toBeUndefined();
    expect(manager.retry("missing")).toBeUndefined();
  });

  it("rejects idempotency-key reuse with a different request body", () => {
    const manager = new ExportJobManager({
      compiler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          compilerVersion: "0.1.0",
          diagnostics: [],
          html: "<h1>Idempotent</h1>",
          messages: [],
          metadata: { language: "en", title: "Idempotent" },
          protocol: "markdown-mint/compiled-document",
          resourceManifest: { entries: [], totalBytes: 0 },
          resources: [],
          toc: [],
          version: 1,
        } satisfies CompiledDocument;
      },
    });
    manager.submit(request(), "conflict-key");
    expect(() =>
      manager.submit(
        { ...request(), source: { assets: [], markdown: "# Different body" } },
        "conflict-key",
      ),
    ).toThrow(/different export request/i);
  });

  it("queues work behind the concurrency limit and rejects when capacity is full", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    const manager = new ExportJobManager({
      compiler: async () => {
        started += 1;
        await gate;
        return {
          compilerVersion: "0.1.0",
          diagnostics: [],
          html: "<h1>Queued</h1>",
          messages: [],
          metadata: { language: "en", title: "Queued" },
          protocol: "markdown-mint/compiled-document",
          resourceManifest: { entries: [], totalBytes: 0 },
          resources: [],
          toc: [],
          version: 1,
        } satisfies CompiledDocument;
      },
      maxConcurrent: 1,
      maxQueued: 2,
    });

    const first = manager.submit(request(), "capacity-a");
    const second = manager.submit(
      { ...request(), source: { assets: [], markdown: "# Second" } },
      "capacity-b",
    );
    expect(() =>
      manager.submit({ ...request(), source: { assets: [], markdown: "# Third" } }, "capacity-c"),
    ).toThrow(/at capacity/i);

    for (let attempt = 0; attempt < 50 && started === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(started).toBe(1);
    expect(manager.get(second.id)?.state).toBe("queued");

    release?.();
    expect((await manager.waitFor(first.id))?.state).toBe("succeeded");
    expect((await manager.waitFor(second.id))?.state).toBe("succeeded");
    expect(started).toBe(2);
  });

  it("surfaces theme, compiler, renderer, and override failures", async () => {
    const invalidTheme = {
      manifest: { ...launchThemeBundles[0]!.manifest, schemaVersion: 2 },
      styles: launchThemeBundles[0]!.styles,
    };
    const themeNotFound = new ExportJobManager({ themeBundles: [] });
    const missingThemeJob = themeNotFound.submit(request(), "missing-theme");
    expect((await themeNotFound.waitFor(missingThemeJob.id))?.error?.code).toBe("theme-not-found");

    const invalidThemeManager = new ExportJobManager({ themeBundles: [invalidTheme] as never });
    const invalidThemeJob = invalidThemeManager.submit(request(), "invalid-theme");
    expect((await invalidThemeManager.waitFor(invalidThemeJob.id))?.error?.code).toBe(
      "theme-invalid",
    );

    const htmlOnly = {
      manifest: { ...launchThemeBundles[0]!.manifest, outputs: ["html"] as const },
      styles: launchThemeBundles[0]!.styles,
    };
    const formatManager = new ExportJobManager({ themeBundles: [htmlOnly] as never });
    const formatJob = formatManager.submit(request("pdf"), "format-failure");
    expect((await formatManager.waitFor(formatJob.id))?.error?.code).toBe("format-not-supported");

    const lockedAccent = {
      manifest: {
        ...launchThemeBundles[0]!.manifest,
        tokens: {
          ...launchThemeBundles[0]!.manifest.tokens,
          "--mm-color-accent": {
            ...launchThemeBundles[0]!.manifest.tokens["--mm-color-accent"]!,
            userOverridable: false,
          },
        },
      },
      styles: launchThemeBundles[0]!.styles,
    };
    const overrideManager = new ExportJobManager({ themeBundles: [lockedAccent] as never });
    const overrideJob = overrideManager.submit(request(), "override-failure");
    expect((await overrideManager.waitFor(overrideJob.id))?.error?.code).toBe("theme-overrides");

    const errorDocument: CompiledDocument = {
      compilerVersion: "0.1.0",
      diagnostics: [{ level: "error", message: "bad", rule: "bad" }],
      html: "",
      messages: ["bad"],
      metadata: { language: "en" },
      protocol: "markdown-mint/compiled-document",
      resourceManifest: { entries: [], totalBytes: 0 },
      resources: [],
      toc: [],
      version: 1,
    };
    const diagnosticManager = new ExportJobManager({ compiler: async () => errorDocument });
    const diagnosticJob = diagnosticManager.submit(request(), "diagnostic-failure");
    expect((await diagnosticManager.waitFor(diagnosticJob.id))?.error?.code).toBe(
      "compile-diagnostics",
    );

    const rendererManager = new ExportJobManager({
      pdfRenderer: async () => {
        throw new Error("renderer");
      },
    });
    const rendererJob = rendererManager.submit(request("pdf"), "renderer-failure");
    expect((await rendererManager.waitFor(rendererJob.id))?.error?.code).toBe("internal-error");

    const unavailableManager = new ExportJobManager({
      pdfRenderer: createChromiumPdfRenderer({
        browserFactory: async () => {
          throw new Error("browser missing");
        },
      }),
    });
    const unavailableJob = unavailableManager.submit(request("pdf"), "backend-unavailable");
    expect((await unavailableManager.waitFor(unavailableJob.id))?.error?.code).toBe(
      "pdf-backend-unavailable",
    );
    await unavailableManager.close();
  });

  it("expires retained artifacts and does not retry expired jobs", async () => {
    let now = 10_000;
    const manager = new ExportJobManager({
      now: () => now,
      pdfRenderer: async ({ title }) => ({
        bytes: createFallbackPdf(title),
        pageCount: 1,
        thumbnail: new Uint8Array([137, 80, 78, 71]),
      }),
      retentionMs: 10,
    });
    const job = manager.submit(request("pdf"), "expire-me");
    await manager.waitFor(job.id);
    expect(manager.getThumbnail(job.id)).toBeDefined();
    now += 11;
    manager.expire();
    expect(manager.get(job.id)?.state).toBe("expired");
    expect(manager.getArtifact(job.id)).toBeUndefined();
    expect(manager.getThumbnail(job.id)).toBeUndefined();
    expect(manager.retry(job.id)?.state).toBe("expired");
  });

  it("assigns a trace ID, emits structured stage events, and cleans the task workspace", async () => {
    const events: Array<Record<string, unknown>> = [];
    let workspaceDir: string | undefined;
    const manager = new ExportJobManager({
      logger: (event) => events.push(event),
      pdfRenderer: async (input) => {
        workspaceDir = input.workspaceDir;
        return { bytes: createFallbackPdf(input.title), pageCount: 1 };
      },
    });

    const job = manager.submit(request("pdf"), "trace-key", "trace-id/42");
    const completed = await manager.waitFor(job.id);

    expect(completed?.traceId).toBe("trace-id/42");
    expect(workspaceDir).toMatch(/markdown-mint-export-/u);
    await expect(access(workspaceDir!)).rejects.toThrow();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "export.stage",
          stage: "compiling",
          state: "started",
          traceId: "trace-id/42",
        }),
        expect.objectContaining({
          event: "export.stage",
          stage: "rendering",
          state: "completed",
          durationMs: expect.any(Number),
        }),
      ]),
    );
  });
});
