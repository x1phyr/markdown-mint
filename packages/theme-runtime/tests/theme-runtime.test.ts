import { describe, expect, it } from "vitest";

import { defineTheme } from "@markdown-mint/theme-sdk";

import {
  assertValidThemeBundle,
  applyThemeOverrides,
  combineThemeCss,
  createThemeCss,
  createThemePreviewHtml,
  validateThemeBundle,
} from "../src/index.js";

const manifest = defineTheme({
  capabilities: {
    callouts: true,
    codeBlocks: true,
    cover: true,
    footnotes: true,
    images: true,
    math: true,
    mermaid: true,
    pageFooter: true,
    pageHeader: true,
    tables: true,
    toc: true,
  },
  category: "technical",
  compatibility: { compiledDocument: 1, compiler: ">=0.1.0 <1.0.0" },
  defaults: {
    accentColor: "#2f735f",
    codeTheme: "github-light",
    density: "normal",
    pageSize: "A4",
  },
  description: "Test theme",
  id: "test-theme",
  name: "Test Theme",
  outputs: ["html", "pdf"],
  schemaVersion: 1,
  tokens: {
    "--mm-color-accent": {
      default: "#2f735f",
      description: "Accent",
      type: "color",
      userOverridable: true,
    },
  },
  version: "0.1.0",
});

describe("combineThemeCss", () => {
  it("combines theme layers in contract order", () => {
    expect(
      combineThemeCss({
        contentCss: "content",
        printCss: "print",
        screenCss: "screen",
        tokensCss: "tokens",
      }),
    ).toBe("tokens\ncontent\nscreen\nprint");
  });

  it("validates semantic layers and only applies declared safe overrides", () => {
    const bundle = {
      manifest,
      styles: {
        contentCss: ".mm-document { color: var(--mm-color-accent); }",
        printCss: "@media print { .mm-document { color: black; } }",
        screenCss: "@media screen { .mm-document { max-width: 52rem; } }",
        tokensCss: ":root { --mm-color-accent: #2f735f; }",
      },
    };

    expect(validateThemeBundle(bundle)).toEqual({ issues: [], valid: true });
    const result = applyThemeOverrides(manifest, {
      "--mm-color-accent": "#123456",
      "--mm-unknown": "red",
      "--mm-color-accent-bad": "red",
    });

    expect(result.values).toEqual({ "--mm-color-accent": "#123456" });
    expect(result.css).toContain("--mm-color-accent: #123456;");
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "unknown-token" })]),
    );
  });

  it("rejects unsafe CSS layers and undeclared tokens", () => {
    const result = validateThemeBundle({
      manifest,
      styles: {
        contentCss: ".mm-document { background: url(https://evil.test/a); behavior: url(a); }",
        printCss: ".mm-document { --mm-unknown: red; }",
        screenCss: ".mm-document {}",
        tokensCss: ":root { --mm-color-accent: #2f735f; }",
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "css-safety" }),
        expect.objectContaining({ rule: "undeclared-token" }),
        expect.objectContaining({ rule: "print-layer" }),
      ]),
    );
  });

  it("creates a deterministic standalone theme preview shell", () => {
    const bundle = {
      manifest,
      styles: {
        contentCss: ".mm-document { color: var(--mm-color-accent); }",
        printCss: "@media print { .mm-document { color: black; } }",
        screenCss: "@media screen { .mm-document { max-width: 52rem; } }",
        tokensCss: ":root { --mm-color-accent: #2f735f; }",
      },
    };

    const result = createThemePreviewHtml(bundle, {
      bodyHtml: "<h1>Fixture</h1>",
      title: "Theme preview",
    });

    expect(result.html).toContain('<main class="mm-document"><h1>Fixture</h1></main>');
    expect(result.html).toContain("--mm-color-accent: #2f735f;");
    expect(result.html).not.toContain("<script");
  });

  it("handles optional layers and malformed bundles without throwing opaque errors", () => {
    expect(combineThemeCss({ contentCss: "", printCss: "", screenCss: "", tokensCss: "" })).toBe(
      "",
    );
    expect(validateThemeBundle(null)).toEqual(
      expect.objectContaining({
        valid: false,
        issues: expect.arrayContaining([expect.objectContaining({ rule: "bundle-object" })]),
      }),
    );
    expect(validateThemeBundle({ manifest })).toEqual(
      expect.objectContaining({
        valid: false,
        issues: expect.arrayContaining([expect.objectContaining({ rule: "styles-object" })]),
      }),
    );
    expect(
      validateThemeBundle({
        styles: {
          contentCss: ".mm-document {}",
          printCss: "@media print {}",
          screenCss: "@media screen {}",
          tokensCss: ":root {}",
        },
      }).valid,
    ).toBe(false);
    expect(validateThemeBundle({ manifest, styles: {} })).toEqual(
      expect.objectContaining({
        valid: false,
        issues: expect.arrayContaining([expect.objectContaining({ rule: "styles-layer" })]),
      }),
    );
    expect(
      validateThemeBundle({
        manifest,
        styles: {
          contentCss: "@import url(https://evil.test); .mm-document {}",
          printCss: "@media print {}",
          screenCss: "@media screen {}",
          tokensCss: ":root {}",
        },
      }).issues,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ rule: "css-safety" })]));
    expect(() => assertValidThemeBundle({ manifest, styles: {} } as never)).toThrow(
      "Invalid theme bundle",
    );
  });

  it("reports locked, invalid, and safe token override paths", () => {
    const lockedManifest = defineTheme({
      ...manifest,
      tokens: {
        ...manifest.tokens,
        "--mm-font-mono": {
          default: "monospace",
          description: "Locked mono font",
          type: "font-family",
          userOverridable: false,
        },
        "--mm-space-unit": {
          default: "4px",
          description: "Spacing",
          type: "length",
          userOverridable: true,
        },
      },
    });
    const result = applyThemeOverrides(lockedManifest, {
      "--mm-font-mono": "serif",
      "--mm-space-unit": "url(https://evil.test)",
    });
    expect(result.values).toEqual({});
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "token-locked" }),
        expect.objectContaining({ rule: "token-value" }),
      ]),
    );
    expect(
      createThemeCss({
        manifest: lockedManifest,
        styles: {
          contentCss: ".mm-document {}",
          printCss: "@media print {}",
          screenCss: "@media screen {}",
          tokensCss: ":root {}",
        },
      }).css,
    ).toContain(".mm-document");
  });
});
