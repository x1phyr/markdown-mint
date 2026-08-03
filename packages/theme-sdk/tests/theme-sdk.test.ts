import { describe, expect, it } from "vitest";

import {
  assertValidThemeManifest,
  defineTheme,
  validateThemeManifest,
  validateThemeTokenValue,
} from "../src/index.js";

const validManifest = {
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
  description: "A valid test theme.",
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
} as const;

describe("theme SDK contract", () => {
  it("accepts valid manifests and rejects malformed contracts with actionable rules", () => {
    expect(validateThemeManifest(validManifest)).toEqual({ issues: [], valid: true });
    expect(defineTheme(validManifest)).toBe(validManifest);
    expect(assertValidThemeManifest(validManifest)).toBe(validManifest);

    const result = validateThemeManifest({
      capabilities: { callouts: "yes" },
      category: "unknown",
      compatibility: { compiledDocument: 2, compiler: "" },
      defaults: { accentColor: "red", codeTheme: "", density: "wide", pageSize: "Legal" },
      description: "",
      id: "Bad ID",
      name: "",
      outputs: ["doc"],
      schemaVersion: 2,
      tokens: {
        "--bad": {
          default: "red; color: blue",
          description: "",
          type: "bad",
          userOverridable: "yes",
        },
      },
      version: "v1",
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((item) => item.rule)).toEqual(
      expect.arrayContaining([
        "manifest-version",
        "theme-id",
        "theme-name",
        "theme-description",
        "theme-category",
        "theme-version",
        "compiled-document-version",
        "compiler-range",
        "theme-outputs",
        "theme-capability",
        "theme-accent",
        "theme-code-theme",
        "theme-density",
        "theme-page-size",
        "token-name",
        "token-value",
        "token-description",
        "token-type",
        "token-overridable",
      ]),
    );
    expect(() => defineTheme(result as never)).toThrow("Invalid theme manifest");
  });

  it("validates user token values by declared type and CSS safety", () => {
    expect(
      validateThemeTokenValue(
        { ...validManifest.tokens["--mm-color-accent"], type: "color" },
        "#123456",
      ),
    ).toBe(true);
    expect(
      validateThemeTokenValue(
        { ...validManifest.tokens["--mm-color-accent"], type: "color" },
        "red",
      ),
    ).toBe(false);
    expect(
      validateThemeTokenValue(
        { ...validManifest.tokens["--mm-color-accent"], type: "length" },
        "1.5rem",
      ),
    ).toBe(true);
    expect(
      validateThemeTokenValue(
        { ...validManifest.tokens["--mm-color-accent"], type: "length" },
        "calc(1rem + 1px)",
      ),
    ).toBe(false);
    expect(
      validateThemeTokenValue(
        { ...validManifest.tokens["--mm-color-accent"], type: "number" },
        "1.25",
      ),
    ).toBe(true);
    expect(
      validateThemeTokenValue(
        { ...validManifest.tokens["--mm-color-accent"], type: "number" },
        "1px",
      ),
    ).toBe(false);
    expect(
      validateThemeTokenValue(
        { ...validManifest.tokens["--mm-color-accent"], type: "font-family" },
        '"Noto Sans SC", sans-serif',
      ),
    ).toBe(true);
    expect(
      validateThemeTokenValue({ ...validManifest.tokens["--mm-color-accent"], type: "string" }, ""),
    ).toBe(false);
    expect(
      validateThemeTokenValue(
        { ...validManifest.tokens["--mm-color-accent"], type: "string" },
        "url(https://evil.test)",
      ),
    ).toBe(false);
  });
});
