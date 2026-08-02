import { describe, expect, it } from "vitest";

import { launchThemes } from "../src/index.js";

describe("launch themes", () => {
  it("ships three distinct v1 theme directions", () => {
    expect(launchThemes.map((theme) => theme.id)).toEqual([
      "technical-mint",
      "minimal-report",
      "editorial-serif",
    ]);
    expect(new Set(launchThemes.map((theme) => theme.category)).size).toBe(3);
  });
});
