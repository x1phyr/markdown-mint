import { describe, expect, it } from "vitest";

import { createDownloadPath, verifyDownloadSignature } from "../src/downloads.js";

const secret = "download-signing-secret-that-is-long-enough";

describe("download signing", () => {
  it("creates a relative signed path and verifies its expiry-bound signature", () => {
    const path = createDownloadPath("job/with spaces", "artifact", {
      expiresAt: 1_800_000_100,
      secret,
    });
    const url = new URL(path, "http://renderer.test");

    expect(url.pathname).toBe("/v1/exports/job%2Fwith%20spaces/artifact");
    expect(
      verifyDownloadSignature({
        expiresAt: url.searchParams.get("expires"),
        jobId: "job/with spaces",
        kind: "artifact",
        nowMs: 1_800_000_000_000,
        secret,
        signature: url.searchParams.get("signature"),
      }),
    ).toBe(true);
    expect(
      verifyDownloadSignature({
        expiresAt: url.searchParams.get("expires"),
        jobId: "job/with spaces",
        kind: "thumbnail",
        nowMs: 1_800_000_000_000,
        secret,
        signature: url.searchParams.get("signature"),
      }),
    ).toBe(false);
  });

  it("rejects malformed, tampered, and expired credentials", () => {
    const path = createDownloadPath("job-1", "artifact", {
      expiresAt: 1_800_000_100,
      secret,
    });
    const url = new URL(path, "http://renderer.test");
    const input = {
      expiresAt: url.searchParams.get("expires"),
      jobId: "job-1",
      kind: "artifact" as const,
      secret,
      signature: url.searchParams.get("signature"),
    };

    expect(verifyDownloadSignature({ ...input, nowMs: 1_800_000_100_000 })).toBe(false);
    expect(
      verifyDownloadSignature({ ...input, signature: "0".repeat(64), nowMs: 1_800_000_000_000 }),
    ).toBe(false);
    expect(
      verifyDownloadSignature({ ...input, expiresAt: "not-a-number", nowMs: 1_800_000_000_000 }),
    ).toBe(false);
  });

  it("keeps local development paths unsigned when no secret is configured", () => {
    expect(createDownloadPath("job-1", "thumbnail")).toBe("/v1/exports/job-1/thumbnail");
  });

  it("derives the expiry from the injected clock and TTL when no expiry is supplied", () => {
    const path = createDownloadPath("job-1", "artifact", {
      nowMs: 1_800_000_000_000,
      secret,
      ttlSeconds: 60,
    });
    expect(new URL(path, "http://renderer.test").searchParams.get("expires")).toBe("1800000060");
  });
});
