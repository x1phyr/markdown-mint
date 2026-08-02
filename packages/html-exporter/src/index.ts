export interface StandaloneHtmlOptions {
  bodyHtml: string;
  css?: string;
  language?: string;
  title: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
