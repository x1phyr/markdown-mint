import { describe, expect, it } from "vitest";

import { compileMarkdown } from "../src/index.js";

describe("compileMarkdown", () => {
  it("compiles GFM content into a semantic HTML fragment", async () => {
    const result = await compileMarkdown("# Hello, *MarkdownMint*\n\n- PDF\n- HTML");

    expect(result.html).toContain("<h1>Hello, <em>MarkdownMint</em></h1>");
    expect(result.html).toContain("<li>PDF</li>");
    expect(result.messages).toEqual([]);
  });

  it("does not pass raw HTML through by default", async () => {
    const result = await compileMarkdown('<script>alert("unsafe")</script>');

    expect(result.html).not.toContain("<script>");
  });
});
