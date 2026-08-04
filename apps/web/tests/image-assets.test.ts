import { describe, expect, it } from "vitest";

import {
  listLocalImageRefs,
  normalizeAssetPath,
  resolveAttachedAssetPath,
  unmatchedLocalImageRefs,
} from "../app/utils/image-assets.js";

describe("image asset path matching", () => {
  it("normalizes local paths the same way the compiler does", () => {
    expect(normalizeAssetPath("./images/photo.png")).toBe("images/photo.png");
    expect(normalizeAssetPath("photo.png")).toBe("photo.png");
    expect(normalizeAssetPath("images\\nested\\a.png")).toBe("images/nested/a.png");
    expect(normalizeAssetPath("../secret.png")).toBeUndefined();
    expect(normalizeAssetPath("")).toBeUndefined();
  });

  it("lists only local Markdown image refs", () => {
    const markdown = [
      "![a](./images/cover.png)",
      "![b](images/cover.png)",
      '![c](diagram.webp "title")',
      "![remote](https://cdn.example/x.png)",
      "![abs](/root.png)",
      "[not image](./doc.md)",
    ].join("\n");

    expect(listLocalImageRefs(markdown)).toEqual(["images/cover.png", "diagram.webp"]);
  });

  it("maps a bare file attach onto a uniquely unmatched nested Markdown path", () => {
    expect(resolveAttachedAssetPath({ name: "cover.png" }, ["images/cover.png", "logo.png"])).toBe(
      "images/cover.png",
    );
  });

  it("keeps basename when multiple unmatched refs share the same file name", () => {
    expect(resolveAttachedAssetPath({ name: "cover.png" }, ["cover.png", "images/cover.png"])).toBe(
      "cover.png",
    );
  });

  it("prefers webkitRelativePath when it already matches a Markdown ref", () => {
    expect(
      resolveAttachedAssetPath({ name: "cover.png", webkitRelativePath: "docs/images/cover.png" }, [
        "images/cover.png",
      ]),
    ).toBe("images/cover.png");
  });

  it("reports unmatched Markdown refs against attached asset paths", () => {
    expect(unmatchedLocalImageRefs(["images/cover.png", "logo.png"], ["./logo.png"])).toEqual([
      "images/cover.png",
    ]);
  });
});
