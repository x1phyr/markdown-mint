import { describe, expect, it } from "vitest";

import { summarizeMarkdown } from "../app/utils/markdown-summary.js";

describe("summarizeMarkdown", () => {
  it("summarizes the import surface without compiling the document", () => {
    const result = summarizeMarkdown(
      "# Title\n\nA [link](https://example.com) and ![image](cover.png).\n\n```ts\nconst ok = true;\n```",
    );

    expect(result).toMatchObject({ headings: 1, images: 1, links: 1, codeBlocks: 1 });
    expect(result.diagnostics).toEqual([]);
    expect(result.words).toBeGreaterThan(3);
  });

  it("surfaces dangerous input as a preflight warning", () => {
    const result = summarizeMarkdown("<script>alert(1)</script>\n\n[jump](javascript:alert(1))");

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: "warning", message: expect.stringContaining("脚本") }),
        expect.objectContaining({ level: "warning", message: expect.stringContaining("URL") }),
      ]),
    );
  });

  it("reports an empty document as blocking before submit", () => {
    expect(summarizeMarkdown("\n\t").diagnostics).toEqual([
      { level: "error", message: "Markdown 内容不能为空。" },
    ]);
  });
});
