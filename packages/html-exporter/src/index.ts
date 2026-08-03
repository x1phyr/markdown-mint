export interface StandaloneHtmlOptions {
  bodyHtml: string;
  css?: string;
  language?: string;
  title: string;
}

export interface DocumentTocEntry {
  children: readonly DocumentTocEntry[];
  id: string;
  level: number;
  text: string;
}

export interface DocumentLayoutFeatures {
  cover: boolean;
  footer: boolean;
  header: boolean;
  pageNumber: boolean;
  toc: boolean;
}

export interface DocumentBodyOptions {
  author?: string;
  bodyHtml: string;
  features?: Partial<DocumentLayoutFeatures>;
  footerText?: string;
  headerText?: string;
  subtitle?: string;
  title: string;
  toc?: readonly DocumentTocEntry[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderToc(entries: readonly DocumentTocEntry[]): string {
  return entries
    .map(
      (entry) =>
        `<li><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.text)}</a>${
          entry.children.length ? `<ol>${renderToc(entry.children)}</ol>` : ""
        }</li>`,
    )
    .join("");
}

/**
 * Adds the document chrome shared by HTML and paged-media adapters. The body
 * itself must already be the sanitized CompiledDocument HTML fragment.
 */
export function createDocumentBodyHtml(options: DocumentBodyOptions): string {
  const features = {
    cover: true,
    footer: true,
    header: false,
    pageNumber: true,
    toc: true,
    ...options.features,
  };
  const sections: string[] = [];

  if (features.cover) {
    sections.push(
      `<section class="mm-cover" aria-label="封面"><h1>${escapeHtml(options.title)}</h1>${
        options.subtitle ? `<p class="mm-cover__subtitle">${escapeHtml(options.subtitle)}</p>` : ""
      }${options.author ? `<p class="mm-cover__author">${escapeHtml(options.author)}</p>` : ""}</section>`,
    );
  }

  if (features.toc && options.toc?.length) {
    sections.push(
      `<nav class="mm-toc" aria-label="目录"><h2>目录</h2><ol>${renderToc(options.toc)}</ol></nav>`,
    );
  }

  if (features.header && options.headerText) {
    sections.push(
      `<header class="mm-document-chrome mm-document-chrome--header">${escapeHtml(options.headerText)}</header>`,
    );
  }

  sections.push(options.bodyHtml);

  if (features.footer) {
    sections.push(
      `<footer class="mm-document-chrome mm-document-chrome--footer">${
        options.footerText ? `<span>${escapeHtml(options.footerText)}</span>` : ""
      }${features.pageNumber ? '<span class="mm-page-number" aria-label="页码"></span>' : ""}</footer>`,
    );
  }

  return sections.join("\n");
}

export function createStandaloneHtml(options: StandaloneHtmlOptions): string {
  const language = escapeHtml(options.language ?? "zh-CN");
  const title = escapeHtml(options.title);

  return `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>${options.css ?? ""}</style>
  </head>
  <body>
    <main class="mm-document">${options.bodyHtml}</main>
  </body>
</html>`;
}
