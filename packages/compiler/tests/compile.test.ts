import { describe, expect, it } from "vitest";

import {
  assertSafeRemoteUrl,
  compileMarkdown,
  isPrivateNetworkHost,
  resolveResources,
} from "../src/index.js";

function createPng(width = 2, height = 2): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes[19] = width;
  bytes[23] = height;
  return bytes;
}

describe("compileMarkdown", () => {
  it("compiles GFM content into a semantic HTML fragment", async () => {
    const result = await compileMarkdown("# Hello, *MarkdownMint*\n\n- PDF\n- HTML");

    expect(result.html).toContain(
      '<h1 id="mm-hello-markdownmint">Hello, <em>MarkdownMint</em></h1>',
    );
    expect(result.html).toContain("<li>PDF</li>");
    expect(result.messages).toEqual([]);
  });

  it("does not pass raw HTML through by default", async () => {
    const result = await compileMarkdown('<script>alert("unsafe")</script>');

    expect(result.html).not.toContain("<script>");
    expect(result.html).not.toContain("onclick");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "html-not-allowed" })]),
    );
  });

  it("returns normalized metadata, nested TOC entries, and footnotes", async () => {
    const result = await compileMarkdown(`---
title: Release notes
subtitle: v0.1 preview
author: MarkdownMint
language: en
---

# Release notes

## Compiler

The compiler is ready.[^one]

[^one]: A stable footnote.
`);

    expect(result.protocol).toBe("markdown-mint/compiled-document");
    expect(result.version).toBe(1);
    expect(result.metadata).toEqual({
      author: "MarkdownMint",
      language: "en",
      subtitle: "v0.1 preview",
      title: "Release notes",
    });
    expect(result.toc).toEqual([
      {
        children: [
          {
            children: [],
            id: "mm-compiler",
            level: 2,
            text: "Compiler",
          },
        ],
        id: "mm-release-notes",
        level: 1,
        text: "Release notes",
      },
    ]);
    expect(result.html).toContain("A stable footnote.");
    expect(result.diagnostics).toEqual([]);
  });

  it("renders supported directives, captions, and normalized code fences", async () => {
    const result = await compileMarkdown(`:::warning{title="Read first"}
This is important.
:::

![Architecture](./architecture.png "System architecture")

::pagebreak

\`\`\`TS extra metadata
const value = 1;
\`\`\`
`);

    expect(result.html).toContain(
      '<aside aria-label="Read first" class="mm-callout mm-callout--warning" role="note">',
    );
    expect(result.html).toContain(
      '<figure class="mm-figure"><img alt="Architecture" src="./architecture.png" title="System architecture"><figcaption class="mm-image-caption">System architecture</figcaption></figure>',
    );
    expect(result.html).toContain(
      '<div aria-label="分页" class="mm-page-break" role="separator"></div>',
    );
    expect(result.html).toContain('<pre style="background-color:#fff;color:#24292e"><code>');
    expect(result.html).toContain('<span style="color:#D73A49">const</span>');
    expect(result.resources).toEqual([
      expect.objectContaining({ kind: "image", url: "./architecture.png" }),
    ]);
  });

  it("blocks dangerous URLs and reports actionable diagnostics", async () => {
    const result = await compileMarkdown(
      [
        "[script](javascript:alert(1))",
        "![file](data:image/png;base64,AAAA)",
        "[encoded](java%73cript:alert(1))",
      ].join("\n\n"),
    );

    expect(result.html).not.toMatch(/javascript|data:image|onload/iu);
    expect(
      result.diagnostics.filter((diagnostic) => diagnostic.rule === "unsafe-url"),
    ).toHaveLength(3);
    expect(result.diagnostics.every((diagnostic) => diagnostic.position)).toBe(true);
    expect(result.diagnostics.every((diagnostic) => diagnostic.suggestion)).toBe(true);
  });

  it("makes duplicate heading IDs deterministic", async () => {
    const result = await compileMarkdown("# Same\n\n## Same\n\n### Same");

    expect(result.html).toContain('id="mm-same"');
    expect(result.html).toContain('id="mm-same-2"');
    expect(result.html).toContain('id="mm-same-3"');
    expect(
      result.diagnostics.filter((diagnostic) => diagnostic.rule === "duplicate-heading"),
    ).toHaveLength(2);
  });

  it("renders math and Mermaid as static, sanitized output", async () => {
    const result = await compileMarkdown(`Inline $x^2$.

\`\`\`mermaid
graph TD
A[Start]-->B[End]
\`\`\`
`);

    expect(result.html).toContain('<span class="katex">');
    expect(result.html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML">');
    expect(result.html).toMatch(/<svg id="mm-mermaid-[a-f0-9]+"/u);
    expect(result.html).not.toMatch(/<script|foreignObject|onclick/iu);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.rule === "mermaid-render")).toEqual(
      [],
    );
  });

  it("emits a Mermaid placeholder when rendering fails", async () => {
    const result = await compileMarkdown("```mermaid\nnot a valid diagram\n```");

    expect(result.html).toContain('class="mm-mermaid-placeholder"');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "mermaid-render" })]),
    );
  });

  it("deduplicates local resources and produces a stable manifest", async () => {
    const bytes = createPng();
    const result = await resolveResources(
      [
        { kind: "image", url: "./cover.png" },
        { kind: "image", url: "./copy.png" },
      ],
      {
        assets: [
          { bytes, path: "cover.png" },
          { bytes, path: "copy.png" },
        ],
      },
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.manifest.entries).toHaveLength(1);
    expect(result.manifest.totalBytes).toBe(bytes.byteLength);
    expect(result.bySource.get("./cover.png")?.path).toBe(result.bySource.get("./copy.png")?.path);
    expect(result.manifest.entries[0]).toEqual(
      expect.objectContaining({ height: 2, mediaType: "image/png", status: "ready", width: 2 }),
    );
  });

  it("rejects private hosts and unsafe redirects before fetching", async () => {
    expect(isPrivateNetworkHost("127.0.0.1")).toBe(true);
    expect(isPrivateNetworkHost("localhost")).toBe(true);
    await expect(assertSafeRemoteUrl("http://127.0.0.1/private.png")).rejects.toMatchObject({
      code: "remote-ssrf",
    });

    let requests = 0;
    const result = await resolveResources(
      [{ kind: "image", url: "https://cdn.example.test/start.png" }],
      {
        fetcher: async () => {
          requests += 1;
          return new Response(null, {
            headers: { location: "http://127.0.0.1/private.png" },
            status: 302,
          });
        },
        policy: { allowRemote: true },
      },
    );

    expect(requests).toBe(1);
    expect(result.manifest.entries[0]).toEqual(
      expect.objectContaining({ errorCode: "remote-ssrf", status: "blocked" }),
    );
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "remote-ssrf" })]),
    );
  });

  it("turns missing local assets into visible placeholders", async () => {
    const result = await compileMarkdown("![Missing](./missing.png)", {
      resolveResources: true,
    });

    expect(result.html).toContain('class="mm-resource-placeholder"');
    expect(result.html).toContain("Image unavailable: Missing");
    expect(result.resourceManifest.entries[0]).toEqual(
      expect.objectContaining({ errorCode: "asset-missing", status: "failed" }),
    );
  });

  it("diagnoses frontmatter variants, URL shapes, and directive variants", async () => {
    const metadata = await compileMarkdown(`+++
title = "Ignored TOML"
language = "en"
+++

# TOML metadata
`);
    expect(metadata.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "frontmatter-format" })]),
    );

    const invalidMetadata = await compileMarkdown(`---
- not an object
---

# Body
`);
    expect(invalidMetadata.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "frontmatter-object" })]),
    );

    const malformedMetadata = await compileMarkdown(`---
title: [unclosed
---

# Body
`);
    expect(malformedMetadata.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "frontmatter-yaml" })]),
    );

    const fields = await compileMarkdown(`---
unknown: ignored
language: not_a_language
subtitle: [not, scalar]
date: 2026-08-03
title: ""
---

# Fallback title
`);
    expect(fields.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "frontmatter-field" }),
        expect.objectContaining({ rule: "frontmatter-language" }),
        expect.objectContaining({ rule: "frontmatter-value" }),
      ]),
    );
    expect(fields.metadata.title).toBe("Fallback title");

    const directives = await compileMarkdown(
      ':mark[marked] and :kbd[enter] and :abbr[API]{title="Application Programming Interface"} and :unknown[plain]\n\n:::unsupported\ncontent\n:::\n\n# ',
    );
    expect(directives.html).toContain("<mark>marked</mark>");
    expect(directives.html).toContain("<kbd>enter</kbd>");
    expect(directives.html).toContain("API");
    expect(directives.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "directive-name" })]),
    );
    expect(directives.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "heading-text" })]),
    );

    const urls = await compileMarkdown(
      "[relative](notes/a.md) [fragment](#section) [query](?download=1) [mail](mailto:test@example.com) [tel](tel:+123) ![image](//cdn.example.com/image.png)",
      { headingIdPrefix: "@@" },
    );
    expect(urls.html).toContain('href="notes/a.md"');
    expect(urls.html).toContain('href="#section"');
    expect(urls.html).toContain('href="?download=1"');
    expect(urls.html).toContain('href="mailto:test@example.com"');
    expect(urls.html).toContain('src="//cdn.example.com/image.png"');
  });

  it("supports disabled rich-content paths and plain code fallbacks", async () => {
    const result = await compileMarkdown(
      "$x^2$\n\n```mermaid\ngraph TD\nA-->B\n```\n\n```unknown-language\nplain\n```\n\n```bad!\nunsafe language\n```",
      { enableMath: false, enableMermaid: false, enableSyntaxHighlighting: false },
    );

    expect(result.html).not.toContain("katex");
    expect(result.html).toContain("mm-mermaid-placeholder");
    expect(result.html).toContain("language-unknown-language");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "mermaid-disabled" }),
        expect.objectContaining({ rule: "code-language" }),
      ]),
    );

    const interactive = await compileMarkdown(
      '```mermaid\ngraph TD\nA-->B\nclick A href "javascript:alert(1)"\n```',
    );
    expect(interactive.html).toContain("mm-mermaid-placeholder");
    expect(interactive.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "mermaid-render" })]),
    );
  });

  it("keeps unlabeled code and uncaptioned images in semantic output", async () => {
    const result = await compileMarkdown(
      '```\nplain text\n```\n\n![Alt text](./image.png)\n\n[Title link](https://example.com "Example")',
    );

    expect(result.html).toContain("<pre><code>plain text");
    expect(result.html).toContain('<img alt="Alt text" src="./image.png">');
    expect(result.html).toContain('title="Example"');
    expect(result.html).not.toContain("mm-image-caption");
  });
});
