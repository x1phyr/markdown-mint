import { describe, expect, it } from "vitest";

import { createFallbackPdf, ExportJobManager } from "../src/jobs.js";
import { createRendererServer } from "../src/server.js";

const downloadSecret = "server-download-signing-secret-that-is-long-enough";

function request(format: "html" | "pdf" = "html") {
  return {
    appearance: { codeTheme: "github-light", density: "normal", themeId: "technical-mint" },
    document: { language: "en", title: "API smoke" },
    features: { cover: true, footer: true, header: false, pageNumber: true, toc: true },
    output: { format },
    page: { margin: "normal", orientation: "portrait", size: "A4" },
    source: { assets: [], markdown: "# API smoke" },
  };
}

describe("renderer HTTP API", () => {
  it("submits, polls, and downloads an export artifact", async () => {
    const manager = new ExportJobManager();
    const server = createRendererServer(manager);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const preflight = await fetch(`${baseUrl}/v1/exports`, { method: "OPTIONS" });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");

      const submitted = await fetch(`${baseUrl}/v1/exports`, {
        body: JSON.stringify(request()),
        headers: {
          "content-type": "application/json",
          "idempotency-key": "api-smoke",
          "x-request-id": "api-trace-1",
        },
        method: "POST",
      });
      expect(submitted.status).toBe(202);
      expect(submitted.headers.get("x-request-id")).toBe("api-trace-1");
      const job = (await submitted.json()) as { id: string; traceId: string };
      expect(job.traceId).toBe("api-trace-1");
      await manager.waitFor(job.id);

      const polled = await fetch(`${baseUrl}/v1/exports/${job.id}`);
      expect(polled.status).toBe(200);
      expect((await polled.json()).state).toBe("succeeded");

      const artifact = await fetch(`${baseUrl}/v1/exports/${job.id}/artifact`);
      expect(artifact.status).toBe(200);
      expect(await artifact.text()).toContain("<!doctype html>");

      const oversized = await fetch(`${baseUrl}/v1/exports`, {
        body: "x".repeat(4 * 1024 * 1024 + 1),
        headers: { "content-type": "application/json", "idempotency-key": "too-large" },
        method: "POST",
      });
      expect(oversized.status).toBe(413);
      expect((await oversized.json()).error).toBe("request-too-large");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("accepts base64-encoded local image assets over HTTP", async () => {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    png[19] = 2;
    png[23] = 2;
    const manager = new ExportJobManager();
    const server = createRendererServer(manager);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const submitted = await fetch(`${baseUrl}/v1/exports`, {
        body: JSON.stringify({
          ...request(),
          source: {
            assets: [
              {
                bytes: Buffer.from(png).toString("base64"),
                mediaType: "image/png",
                path: "cover.png",
              },
            ],
            markdown: "# Offline HTML\n\n![Cover](./cover.png)",
          },
        }),
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-assets",
        },
        method: "POST",
      });
      expect(submitted.status).toBe(202);
      const job = (await submitted.json()) as { id: string };
      await manager.waitFor(job.id);

      const artifact = await fetch(`${baseUrl}/v1/exports/${job.id}/artifact`);
      expect(artifact.status).toBe(200);
      const html = await artifact.text();
      expect(html).toContain("data:image/png;base64,");
      expect(html).not.toContain("./cover.png");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("rejects overloaded submissions with a capacity response", async () => {
    const manager = new ExportJobManager({
      compiler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {
          compilerVersion: "0.1.0",
          diagnostics: [],
          html: "<h1>Busy</h1>",
          messages: [],
          metadata: { language: "en", title: "Busy" },
          protocol: "markdown-mint/compiled-document",
          resourceManifest: { entries: [], totalBytes: 0 },
          resources: [],
          toc: [],
          version: 1,
        };
      },
      maxConcurrent: 1,
      maxQueued: 1,
    });
    const server = createRendererServer(manager);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const first = await fetch(`${baseUrl}/v1/exports`, {
        body: JSON.stringify(request()),
        headers: { "content-type": "application/json", "idempotency-key": "capacity-1" },
        method: "POST",
      });
      expect(first.status).toBe(202);
      const firstJob = (await first.json()) as { id: string };

      const second = await fetch(`${baseUrl}/v1/exports`, {
        body: JSON.stringify(request()),
        headers: { "content-type": "application/json", "idempotency-key": "capacity-2" },
        method: "POST",
      });
      expect(second.status).toBe(503);
      expect((await second.json()).error).toBe("capacity");
      await manager.waitFor(firstJob.id);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("serves the PDF first-page thumbnail with the export metadata", async () => {
    const thumbnail = new Uint8Array([137, 80, 78, 71]);
    const manager = new ExportJobManager({
      pdfRenderer: async ({ title }) => ({
        bytes: createFallbackPdf(title),
        pageCount: 1,
        thumbnail,
      }),
    });
    const server = createRendererServer(manager);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const submitted = await fetch(`${baseUrl}/v1/exports`, {
        body: JSON.stringify(request("pdf")),
        headers: { "content-type": "application/json", "idempotency-key": "thumbnail-smoke" },
        method: "POST",
      });
      expect(submitted.status).toBe(202);
      const job = (await submitted.json()) as { id: string };
      await manager.waitFor(job.id);

      const polled = await fetch(`${baseUrl}/v1/exports/${job.id}`);
      const status = (await polled.json()) as {
        artifact?: { thumbnail?: { fileName: string; mediaType: string } };
      };
      expect(status.artifact?.thumbnail).toEqual(
        expect.objectContaining({ fileName: "API-smoke-thumbnail.png", mediaType: "image/png" }),
      );

      const response = await fetch(`${baseUrl}/v1/exports/${job.id}/thumbnail`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("content-disposition")).toContain("API-smoke-thumbnail.png");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(thumbnail);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("requires short-lived signed URLs when download signing is configured", async () => {
    let now = 1_800_000_000_000;
    const thumbnail = new Uint8Array([137, 80, 78, 71]);
    const manager = new ExportJobManager({
      pdfRenderer: async ({ title }) => ({
        bytes: createFallbackPdf(title),
        pageCount: 1,
        thumbnail,
      }),
    });
    const server = createRendererServer(manager, {
      downloadSigningSecret: downloadSecret,
      downloadSigningTtlSeconds: 30,
      now: () => now,
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const submitted = await fetch(`${baseUrl}/v1/exports`, {
        body: JSON.stringify(request("pdf")),
        headers: { "content-type": "application/json", "idempotency-key": "signed-smoke" },
        method: "POST",
      });
      const job = (await submitted.json()) as { id: string };
      await manager.waitFor(job.id);

      const statusResponse = await fetch(`${baseUrl}/v1/exports/${job.id}`);
      const status = (await statusResponse.json()) as {
        downloads?: { artifactUrl?: string; expiresAt?: number; thumbnailUrl?: string };
      };
      expect(status.downloads?.artifactUrl).toContain("signature=");
      expect(status.downloads?.thumbnailUrl).toContain("signature=");
      expect(status.downloads?.expiresAt).toBe(1_800_000_030);

      const signed = await fetch(new URL(status.downloads!.artifactUrl!, baseUrl));
      expect(signed.status).toBe(200);
      expect(signed.headers.get("content-type")).toBe("application/pdf");
      expect(new Uint8Array(await signed.arrayBuffer()).slice(0, 8)).toEqual(
        new Uint8Array(Buffer.from("%PDF-1.4")),
      );

      const signedThumbnail = await fetch(new URL(status.downloads!.thumbnailUrl!, baseUrl));
      expect(signedThumbnail.status).toBe(200);
      expect(new Uint8Array(await signedThumbnail.arrayBuffer())).toEqual(thumbnail);

      const unsigned = await fetch(`${baseUrl}/v1/exports/${job.id}/artifact`);
      expect(unsigned.status).toBe(403);

      const tampered = new URL(status.downloads!.artifactUrl!, baseUrl);
      tampered.searchParams.set("signature", "0".repeat(64));
      expect((await fetch(tampered)).status).toBe(403);

      now += 31_000;
      expect((await fetch(new URL(status.downloads!.artifactUrl!, baseUrl))).status).toBe(403);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("automatically expires retained artifacts and thumbnails", async () => {
    const thumbnail = new Uint8Array([137, 80, 78, 71]);
    const manager = new ExportJobManager({
      pdfRenderer: async ({ title }) => ({
        bytes: createFallbackPdf(title),
        pageCount: 1,
        thumbnail,
      }),
      retentionMs: 20,
    });
    const server = createRendererServer(manager, { retentionSweepMs: 5 });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const submitted = await fetch(`${baseUrl}/v1/exports`, {
        body: JSON.stringify(request("pdf")),
        headers: { "content-type": "application/json", "idempotency-key": "retention-smoke" },
        method: "POST",
      });
      const job = (await submitted.json()) as { id: string };
      await manager.waitFor(job.id);

      await new Promise((resolve) => setTimeout(resolve, 60));
      const expired = await fetch(`${baseUrl}/v1/exports/${job.id}`);
      const status = (await expired.json()) as { state: string; artifact?: unknown };
      expect(status.state).toBe("expired");
      expect(status.artifact).toBeUndefined();
      expect((await fetch(`${baseUrl}/v1/exports/${job.id}/thumbnail`)).status).toBe(409);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
