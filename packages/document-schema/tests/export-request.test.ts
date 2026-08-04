import { describe, expect, it } from "vitest";

import {
  encodeBase64,
  exportJobPayloadSchema,
  exportRequestSchema,
  toWireExportRequest,
} from "../src/index.js";

function createPng(width = 2, height = 2): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes[19] = width;
  bytes[23] = height;
  return bytes;
}

describe("exportRequestSchema", () => {
  it("applies safe document defaults", () => {
    const result = exportRequestSchema.parse({
      appearance: { themeId: "technical-mint" },
      document: {},
      features: {},
      output: { format: "pdf" },
      page: {},
      source: { markdown: "# Hello" },
    });

    expect(result.appearance.density).toBe("normal");
    expect(result.document.language).toBe("zh-CN");
    expect(result.features.toc).toBe(true);
    expect(result.page.size).toBe("A4");
  });

  it("accepts base64 asset bytes from the JSON wire format", () => {
    const png = createPng();
    const result = exportRequestSchema.parse({
      appearance: { themeId: "technical-mint" },
      document: {},
      features: {},
      output: { format: "html" },
      page: {},
      source: {
        assets: [
          {
            bytes: encodeBase64(png),
            mediaType: "image/png",
            path: "cover.png",
          },
        ],
        markdown: "# Hello\n\n![Cover](./cover.png)",
      },
    });

    expect(result.source.assets[0]?.bytes).toEqual(png);
    expect(toWireExportRequest(result).source.assets[0]?.bytes).toBe(encodeBase64(png));
  });

  it("still accepts in-process Uint8Array assets", () => {
    const png = createPng();
    const result = exportRequestSchema.parse({
      appearance: { themeId: "technical-mint" },
      document: {},
      features: {},
      output: { format: "html" },
      page: {},
      source: {
        assets: [{ bytes: png, mediaType: "image/png", path: "cover.png" }],
        markdown: "# Hello",
      },
    });
    expect(result.source.assets[0]?.bytes).toEqual(png);
  });

  it("rejects parent-path assets, oversized markdown, and invalid base64", () => {
    expect(() =>
      exportRequestSchema.parse({
        appearance: { themeId: "technical-mint" },
        document: {},
        features: {},
        output: { format: "html" },
        page: {},
        source: {
          assets: [{ bytes: encodeBase64(createPng()), mediaType: "image/png", path: "../x.png" }],
          markdown: "# Hello",
        },
      }),
    ).toThrow();

    expect(() =>
      exportRequestSchema.parse({
        appearance: { themeId: "technical-mint" },
        document: {},
        features: {},
        output: { format: "html" },
        page: {},
        source: {
          assets: [{ bytes: "!!!!", mediaType: "image/png", path: "x.png" }],
          markdown: "# Hello",
        },
      }),
    ).toThrow();

    expect(() =>
      exportRequestSchema.parse({
        appearance: { themeId: "technical-mint" },
        document: {},
        features: {},
        output: { format: "html" },
        page: {},
        source: { markdown: "x".repeat(4 * 1024 * 1024 + 1) },
      }),
    ).toThrow();
  });
});

describe("exportJobPayloadSchema", () => {
  it("accepts a successful job payload with optional downloads", () => {
    const result = exportJobPayloadSchema.parse({
      attempt: 1,
      createdAt: 1,
      diagnostics: [],
      downloads: { artifactUrl: "/v1/exports/job/artifact?signature=abc" },
      id: "job",
      idempotencyKey: "key",
      logs: [{ stage: "queued", startedAt: 1, finishedAt: 2, durationMs: 1 }],
      state: "succeeded",
      traceId: "trace",
      updatedAt: 2,
      artifact: {
        fileName: "doc.html",
        format: "html",
        mediaType: "text/html; charset=utf-8",
        sha256: "abc",
        sizeBytes: 12,
      },
    });
    expect(result.state).toBe("succeeded");
    expect(result.downloads?.artifactUrl).toContain("signature=");
  });
});
