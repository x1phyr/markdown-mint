import { describe, expect, it } from "vitest";

import { createDocumentBodyHtml, createStandaloneHtml } from "../src/index.js";

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

  it("composes cover, nested TOC, chrome, and compiled body safely", () => {
    const body = createDocumentBodyHtml({
      author: "A <maintainer>",
      bodyHtml: '<h1 id="mm-intro">Intro</h1>',
      features: { footer: true, header: true, pageNumber: true, toc: true },
      footerText: "MarkdownMint",
      headerText: "Release notes",
      subtitle: "A <subtitle>",
      title: "A <title>",
      toc: [
        {
          children: [{ children: [], id: "mm-detail", level: 2, text: "Detail" }],
          id: "mm-intro",
          level: 1,
          text: "Intro",
        },
      ],
    });

    expect(body).toContain('<section class="mm-cover" aria-label="封面"><h1>A &lt;title&gt;</h1>');
    expect(body).toContain('<a href="#mm-intro">Intro</a><ol><li><a href="#mm-detail">Detail</a>');
    expect(body).toContain('class="mm-page-number"');
    expect(body).toContain('<h1 id="mm-intro">Intro</h1>');
    expect(body).not.toContain("<script");
  });

  it("can omit optional document chrome and uses standalone defaults", () => {
    const body = createDocumentBodyHtml({
      bodyHtml: "<p>Body</p>",
      features: { cover: false, footer: false, header: false, pageNumber: false, toc: false },
      title: "Title",
    });
    const html = createStandaloneHtml({ bodyHtml: body, title: "Title" });

    expect(body).toBe("<p>Body</p>");
    expect(html).toContain('<html lang="zh-CN">');

    const footerWithoutNumber = createDocumentBodyHtml({
      bodyHtml: "<p>Body</p>",
      features: { cover: false, footer: true, pageNumber: false, toc: false },
      title: "Title",
    });
    expect(footerWithoutNumber).toContain("mm-document-chrome--footer");
    expect(footerWithoutNumber).not.toContain("mm-page-number");
  });
});
