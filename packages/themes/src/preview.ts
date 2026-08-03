export const launchPreviewMarkdown = `---
title: MarkdownMint theme sample
subtitle: A shared preview for the launch themes
author: MarkdownMint
language: en
---

# A document with a point of view

The launch themes share one semantic source while changing the pace, density, and reading texture.

> A good document makes its hierarchy easy to feel.

## Content blocks

| Signal | Treatment |
| --- | --- |
| Code | Static syntax highlighting |
| Tables | Repeated headers in print |
| Output | HTML and PDF |

\`\`\`ts
export const artifact = "ready";
\`\`\`
`;

/** A fixed, sanitized semantic fragment used by the gallery iframe. */
export const launchPreviewBodyHtml = `<h1 id="mm-a-document-with-a-point-of-view">A document with a point of view</h1>
<p>The launch themes share one semantic source while changing the pace, density, and reading texture.</p>
<blockquote><p>A good document makes its hierarchy easy to feel.</p></blockquote>
<h2 id="mm-content-blocks">Content blocks</h2>
<table><thead><tr><th>Signal</th><th>Treatment</th></tr></thead><tbody><tr><td>Code</td><td>Static syntax highlighting</td></tr><tr><td>Tables</td><td>Repeated headers in print</td></tr><tr><td>Output</td><td>HTML and PDF</td></tr></tbody></table>
<pre><code>export const artifact = "ready";</code></pre>`;
