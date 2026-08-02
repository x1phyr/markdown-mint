import { describe, expect, it } from "vitest";

import { exportRequestSchema } from "../src/index.js";

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
});
