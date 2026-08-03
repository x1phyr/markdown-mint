import { describe, expect, it } from "vitest";

import { assertSafeRemoteUrl, isPrivateNetworkHost, resolveResources } from "../src/index.js";

function createPng(width = 2, height = 2): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes[19] = width;
  bytes[23] = height;
  return bytes;
}

function createGif(width = 2, height = 3): Uint8Array {
  const bytes = new Uint8Array(10);
  bytes.set([71, 73, 70, 56, 0, 0, 0, 0, height, width]);
  bytes[6] = width;
  bytes[8] = height;
  return bytes;
}

function createJpeg(width = 4, height = 5): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0,
    4,
    0,
    0,
    0xff,
    0xc0,
    0,
    11,
    8,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0,
    0,
    0,
    0,
    0,
  ]);
}

function createWebp(width = 6, height = 7): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set(
    [..."RIFF"].map((character) => character.charCodeAt(0)),
    0,
  );
  bytes.set(
    [..."WEBP"].map((character) => character.charCodeAt(0)),
    8,
  );
  bytes.set(
    [..."VP8X"].map((character) => character.charCodeAt(0)),
    12,
  );
  bytes[24] = (width - 1) & 0xff;
  bytes[25] = ((width - 1) >> 8) & 0xff;
  bytes[26] = (width - 1) >> 16;
  bytes[27] = (height - 1) & 0xff;
  bytes[28] = ((height - 1) >> 8) & 0xff;
  bytes[29] = (height - 1) >> 16;
  return bytes;
}

describe("resolveResources", () => {
  it("detects supported local image formats and keeps stable paths", async () => {
    const assets = [
      { bytes: createGif(), mediaType: "image/gif", path: "gif.gif" },
      { bytes: createJpeg(), mediaType: "image/jpeg", path: "photo.jpg" },
      { bytes: createWebp(), mediaType: "image/webp", path: "diagram.webp" },
      {
        bytes: new TextEncoder().encode('<svg viewBox="0 0 10 10"><path d="M0 0"/></svg>'),
        mediaType: "image/svg+xml",
        path: "icon.svg",
      },
    ];
    const result = await resolveResources(
      assets.map((asset) => ({ kind: "image" as const, url: `./${asset.path}` })),
      { assets },
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.manifest.entries.map((entry) => entry.mediaType)).toEqual([
      "image/gif",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
    ]);
    expect(result.manifest.entries.map((entry) => entry.path)).toEqual([
      expect.stringMatching(/^assets\/asset-[a-f0-9]{16}\.gif$/u),
      expect.stringMatching(/^assets\/asset-[a-f0-9]{16}\.jpg$/u),
      expect.stringMatching(/^assets\/asset-[a-f0-9]{16}\.webp$/u),
      expect.stringMatching(/^assets\/asset-[a-f0-9]{16}\.svg$/u),
    ]);
    expect(result.manifest.entries[1]).toEqual(expect.objectContaining({ height: 5, width: 4 }));
  });

  it("rejects unsafe formats and all local resource limits", async () => {
    const unsafeSvg = new TextEncoder().encode("<svg><script>alert(1)</script></svg>");
    const tooLargeBytes = new Uint8Array(101);
    tooLargeBytes.set(createPng());
    const result = await resolveResources(
      [
        { kind: "image", url: "./bad.bin" },
        { kind: "image", url: "./unsafe.svg" },
        { kind: "image", url: "./too-large.png" },
        { kind: "image", url: "./too-wide.png" },
        { kind: "image", url: "./second.png" },
      ],
      {
        assets: [
          { bytes: new Uint8Array([1, 2, 3]), path: "bad.bin" },
          { bytes: unsafeSvg, mediaType: "image/svg+xml", path: "unsafe.svg" },
          { bytes: tooLargeBytes, path: "too-large.png" },
          { bytes: createPng(20, 20), path: "too-wide.png" },
          { bytes: createPng(3, 3), path: "second.png" },
        ],
        policy: { maxAssetBytes: 100, maxImagePixels: 10, maxResources: 5, maxTotalBytes: 20 },
      },
    );

    expect(result.manifest.entries.map((entry) => entry.errorCode)).toEqual([
      "image-format",
      "image-format",
      "resource-size",
      "image-pixels",
      "resource-total-size",
    ]);
    expect(result.diagnostics).toHaveLength(5);

    const countLimited = await resolveResources(
      [
        { kind: "image", url: "./one.png" },
        { kind: "image", url: "./two.png" },
      ],
      {
        assets: [
          { bytes: createPng(2, 2), path: "one.png" },
          { bytes: createPng(3, 2), path: "two.png" },
        ],
        policy: { maxResources: 1 },
      },
    );
    expect(countLimited.manifest.entries[1]?.errorCode).toBe("resource-count");
  });

  it("handles remote cache, status, body, DNS, redirect, and timeout failures", async () => {
    const cache = new Map<string, Uint8Array>();
    const ok = await resolveResources([{ kind: "image", url: "https://cdn.example.test/ok.png" }], {
      cache,
      fetcher: async () => new Response(createPng(), { headers: { "content-type": "image/png" } }),
      policy: { allowRemote: true },
    });
    expect(ok.manifest.entries[0]?.status).toBe("ready");
    expect(cache.size).toBe(1);

    const httpFailure = await resolveResources(
      [{ kind: "image", url: "https://cdn.example.test/missing.png" }],
      { fetcher: async () => new Response(null, { status: 404 }), policy: { allowRemote: true } },
    );
    expect(httpFailure.manifest.entries[0]).toEqual(
      expect.objectContaining({ errorCode: "remote-http", status: "failed" }),
    );
    expect(httpFailure.diagnostics[0]?.level).toBe("warning");

    const oversized = await resolveResources(
      [{ kind: "image", url: "https://cdn.example.test/large.png" }],
      {
        fetcher: async () =>
          new Response(createPng(), {
            headers: { "content-length": "999", "content-type": "image/png" },
          }),
        policy: { allowRemote: true, maxAssetBytes: 10 },
      },
    );
    expect(oversized.manifest.entries[0]?.errorCode).toBe("resource-size");

    const dnsBlocked = await resolveResources(
      [{ kind: "image", url: "https://dns.example.test/image.png" }],
      {
        lookupHost: async () => ["10.0.0.2"],
        policy: { allowRemote: true },
      },
    );
    expect(dnsBlocked.manifest.entries[0]?.errorCode).toBe("remote-ssrf");

    const timeout = await resolveResources(
      [{ kind: "image", url: "https://slow.example.test/image.png" }],
      {
        fetcher: async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
              once: true,
            });
          }),
        policy: { allowRemote: true, requestTimeoutMs: 1 },
      },
    );
    expect(timeout.manifest.entries[0]?.errorCode).toBe("remote-timeout");
  });

  it("protects URL validation and redirect policy", async () => {
    await expect(assertSafeRemoteUrl("ftp://example.test/file.png")).rejects.toMatchObject({
      code: "remote-protocol",
    });
    await expect(
      assertSafeRemoteUrl("https://user:pass@example.test/file.png"),
    ).rejects.toMatchObject({
      code: "remote-credentials",
    });
    await expect(
      assertSafeRemoteUrl("https://dns.example.test/file.png", async () => {
        throw new Error("dns");
      }),
    ).rejects.toMatchObject({ code: "remote-dns" });
    expect(isPrivateNetworkHost("::1")).toBe(true);
    expect(isPrivateNetworkHost("8.8.8.8")).toBe(false);

    const noLocation = await resolveResources(
      [{ kind: "image", url: "https://cdn.example.test/start.png" }],
      {
        fetcher: async () => new Response(null, { status: 302 }),
        policy: { allowRemote: true },
      },
    );
    expect(noLocation.manifest.entries[0]?.errorCode).toBe("remote-redirect");

    const tooManyRedirects = await resolveResources(
      [{ kind: "image", url: "https://cdn.example.test/start.png" }],
      {
        fetcher: async () =>
          new Response(null, {
            headers: { location: "/next.png" },
            status: 302,
          }),
        policy: { allowRemote: true, maxRedirects: 0 },
      },
    );
    expect(tooManyRedirects.manifest.entries[0]?.errorCode).toBe("remote-redirect");
  });

  it("deduplicates repeated sources and reads a cached remote asset", async () => {
    const remoteUrl = "https://cdn.example.test/cached.png";
    const cache = new Map([[remoteUrl, createPng()]]);
    let fetches = 0;
    const result = await resolveResources(
      [
        { kind: "image", url: remoteUrl },
        { kind: "image", url: remoteUrl },
        { kind: "image", url: "../invalid.png" },
      ],
      {
        assets: [{ bytes: createPng(), path: "../invalid.png" }],
        cache,
        fetcher: async () => {
          fetches += 1;
          return new Response(null, { status: 500 });
        },
        policy: { allowRemote: true },
      },
    );

    expect(fetches).toBe(0);
    expect(result.manifest.entries).toHaveLength(2);
    expect(result.manifest.entries[0]?.status).toBe("ready");
    expect(result.manifest.entries[1]?.errorCode).toBe("asset-missing");
  });
});
