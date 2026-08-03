import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compileMarkdown } from "../src/index.js";

const corpusDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/p7-compatibility",
);
const fixtureNames = readdirSync(corpusDirectory)
  .filter((name) => name.endsWith(".md") && name !== "README.md")
  .sort();

describe("public compatibility corpus", () => {
  it("keeps thirty authored input shapes in the regression baseline", () => {
    expect(fixtureNames).toHaveLength(30);
  });

  for (const fixtureName of fixtureNames) {
    it(`compiles ${fixtureName} without throwing`, async () => {
      const result = await compileMarkdown(
        readFileSync(resolve(corpusDirectory, fixtureName), "utf8"),
        { enableMermaid: fixtureName === "10-mermaid.md" },
      );

      expect(result.protocol).toBe("markdown-mint/compiled-document");
      expect(result.version).toBe(1);
      expect(result.html).toBeTypeOf("string");
      expect(result.diagnostics.some((diagnostic) => diagnostic.level === "error")).toBe(false);
    });
  }
});
