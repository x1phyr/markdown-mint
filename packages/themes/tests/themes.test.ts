import { describe, expect, it } from "vitest";

import { compileMarkdown } from "@markdown-mint/compiler";
import { validateThemeManifest } from "@markdown-mint/theme-sdk";
import { createThemePreviewHtml } from "@markdown-mint/theme-runtime";

import {
  getThemeDetails,
  launchThemeBundles,
  launchThemeDetails,
  launchThemes,
} from "../src/index.js";

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const themeFixture = readFileSync(
  resolve(dirname(new URL(import.meta.url).pathname), "../../../fixtures/p5-themes.md"),
  "utf8",
);

describe("launch themes", () => {
  it("ships three distinct v1 theme directions", () => {
    expect(launchThemes.map((theme) => theme.id)).toEqual([
      "technical-mint",
      "minimal-report",
      "editorial-serif",
    ]);
    expect(new Set(launchThemes.map((theme) => theme.category)).size).toBe(3);
  });

  it("keeps every launch theme manifest and CSS layer on the contract", () => {
    for (const bundle of launchThemeBundles) {
      expect(validateThemeManifest(bundle.manifest)).toEqual({ issues: [], valid: true });
      expect(bundle.styles.tokensCss).toContain("--mm-color-accent");
      expect(bundle.styles.contentCss).toContain(".mm-document");
      expect(bundle.styles.coverCss).toContain(".mm-cover");
      expect(bundle.styles.printCss).toContain("@media print");
      expect(bundle.styles.screenCss).toContain("@media screen");
      expect(bundle.styles).not.toMatchObject({
        contentCss: expect.stringMatching(/@import|url\(/iu),
      });
    }
  });

  it("publishes details for the shared acceptance fixture", () => {
    expect(launchThemeDetails).toHaveLength(3);
    expect(launchThemeDetails.map((details) => details.id)).toEqual(
      launchThemes.map((theme) => theme.id),
    );
    for (const details of launchThemeDetails) {
      expect(details.sampleFixture).toBe("fixtures/p5-themes.md");
      expect(details.sampleFormats).toEqual(["html", "pdf"]);
      expect(details.bestFor.length).toBeGreaterThan(1);
      expect(details.contentCoverage.length).toBeGreaterThan(2);
    }
    expect(getThemeDetails("technical-mint")?.id).toBe("technical-mint");
    expect(getThemeDetails("missing-theme")).toBeUndefined();
  });

  it("renders one rich compiled fixture through every launch theme", async () => {
    const compiled = await compileMarkdown(themeFixture);
    expect(compiled.diagnostics.filter((diagnostic) => diagnostic.level === "error")).toEqual([]);
    const flattenLevels = (entries: typeof compiled.toc): number[] =>
      entries.flatMap((entry) => [entry.level, ...flattenLevels(entry.children)]);
    expect(flattenLevels(compiled.toc)).toEqual([1, 2, 3, 4, 5, 6, 3, 2, 3, 3, 3, 2]);
    expect(compiled.html).toContain("mm-callout");
    expect(compiled.html).toContain("mm-page-break");
    expect(compiled.html).toContain("katex");
    expect(compiled.html).toContain("mm-mermaid-");
    expect(compiled.html).toContain("mm-image-caption");
    expect(compiled.html).toContain("footnotes");

    const previews = launchThemeBundles.map((bundle) =>
      createThemePreviewHtml(bundle, {
        bodyHtml: compiled.html,
        title: `${bundle.manifest.name} acceptance fixture`,
      }),
    );
    expect(previews.every((preview) => preview.issues.length === 0)).toBe(true);
    expect(new Set(previews.map((preview) => preview.html)).size).toBe(3);
  });
});
