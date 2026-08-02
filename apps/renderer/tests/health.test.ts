import { describe, expect, it } from "vitest";

import { createHealthPayload } from "../src/health.js";

describe("renderer health payload", () => {
  it("reports a stable service identity", () => {
    expect(createHealthPayload("1.2.3")).toEqual({
      service: "markdown-mint-renderer",
      status: "ok",
      version: "1.2.3",
    });
  });
});
