import { describe, expect, it } from "vitest";

import { createStandaloneHtml } from "../src/index.js";

describe("createStandaloneHtml", () => {
  it("creates a portable document and escapes metadata", () => {
    const html = createStandaloneHtml({
      bodyHtml: "<h1>Safe compiled content</h1>",
      css: ".mm-document { color: #20211f; }",
      title: "A <great> document",
    });

    expect(html).toContain("<title>A &lt;great&gt; document</title>");
    expect(html).toContain('<main class="mm-document"><h1>Safe compiled content</h1></main>');
  });
});
