import type { ThemeStyles } from "@markdown-mint/theme-sdk";

const baseContentCss = String.raw`
.mm-document {
  color: var(--mm-color-text);
  font-family: var(--mm-font-body);
  font-size: var(--mm-size-body);
  line-height: var(--mm-leading-body);
  overflow-wrap: anywhere;
}

.mm-document h1,
.mm-document h2,
.mm-document h3,
.mm-document h4,
.mm-document h5,
.mm-document h6 {
  color: var(--mm-color-heading);
  font-family: var(--mm-font-heading);
  line-height: 1.2;
  margin: calc(var(--mm-space-unit) * 8) 0 calc(var(--mm-space-unit) * 3);
  break-after: avoid;
}

.mm-document h1 { font-size: 2.4rem; }
.mm-document h2 { font-size: 1.85rem; }
.mm-document h3 { font-size: 1.45rem; }
.mm-document h4 { font-size: 1.2rem; }
.mm-document h5,
.mm-document h6 { font-size: 1rem; }

.mm-document p,
.mm-document ul,
.mm-document ol,
.mm-document blockquote,
.mm-document table,
.mm-document figure,
.mm-document pre {
  margin: 0 0 calc(var(--mm-space-unit) * 4);
}

.mm-document a { color: var(--mm-color-accent); }
.mm-document hr { border: 0; border-top: 1px solid var(--mm-color-border); }
.mm-document blockquote {
  border-left: 0.25rem solid var(--mm-color-accent);
  color: var(--mm-color-muted);
  padding: calc(var(--mm-space-unit) * 2) calc(var(--mm-space-unit) * 4);
}

.mm-document code,
.mm-document pre {
  font-family: var(--mm-font-mono);
}

.mm-document :not(pre) > code {
  background: var(--mm-color-code-surface);
  border-radius: var(--mm-radius);
  padding: 0.1em 0.3em;
}

.mm-document pre {
  border: 1px solid var(--mm-color-border);
  border-radius: var(--mm-radius);
  overflow-x: auto;
  padding: calc(var(--mm-space-unit) * 4);
}

.mm-document table {
  border-collapse: collapse;
  width: 100%;
}

.mm-document th,
.mm-document td {
  border: 1px solid var(--mm-color-border);
  padding: calc(var(--mm-space-unit) * 2);
  text-align: left;
  vertical-align: top;
}

.mm-document th { background: var(--mm-color-code-surface); }
.mm-document img { max-width: 100%; }
.mm-document .mm-figure { text-align: center; }
.mm-document .mm-image-caption { color: var(--mm-color-muted); font-size: 0.9em; }
.mm-document .mm-callout {
  background: var(--mm-color-callout-surface);
  border-left: 0.3rem solid var(--mm-color-accent);
  border-radius: var(--mm-radius);
  margin: calc(var(--mm-space-unit) * 4) 0;
  padding: calc(var(--mm-space-unit) * 3) calc(var(--mm-space-unit) * 4);
}
.mm-document .mm-callout__title { color: var(--mm-color-heading); font-weight: 700; }
.mm-document .mm-page-break { break-after: page; height: 0; }
.mm-document .mm-resource-placeholder,
.mm-document .mm-mermaid-placeholder {
  border: 1px dashed var(--mm-color-accent);
  color: var(--mm-color-muted);
  display: block;
  padding: calc(var(--mm-space-unit) * 3);
}
.mm-document .footnotes { border-top: 1px solid var(--mm-color-border); font-size: 0.9em; margin-top: calc(var(--mm-space-unit) * 8); }
.mm-document .mm-toc {
  border-bottom: 1px solid var(--mm-color-border);
  margin: calc(var(--mm-space-unit) * 8) 0;
  padding-bottom: calc(var(--mm-space-unit) * 6);
}
.mm-document .mm-toc h2 { margin-top: 0; }
.mm-document .mm-toc ol { padding-left: calc(var(--mm-space-unit) * 5); }
.mm-document .mm-toc li { margin-bottom: calc(var(--mm-space-unit) * 1); }
.mm-document .mm-document-chrome {
  color: var(--mm-color-muted);
  font-size: 0.8em;
}
.mm-document .mm-document-chrome--header {
  border-bottom: 1px solid var(--mm-color-border);
  margin-bottom: calc(var(--mm-space-unit) * 4);
  padding-bottom: calc(var(--mm-space-unit) * 2);
}
.mm-document .mm-document-chrome--footer {
  border-top: 1px solid var(--mm-color-border);
  display: flex;
  justify-content: space-between;
  margin-top: calc(var(--mm-space-unit) * 8);
  padding-top: calc(var(--mm-space-unit) * 2);
}
`;

const baseScreenCss = String.raw`
@media screen {
  .mm-document {
    margin: 0 auto;
    max-width: 52rem;
    padding: calc(var(--mm-space-unit) * 12) calc(var(--mm-space-unit) * 8);
  }
}
`;

const basePrintCss = String.raw`
@media print {
  .mm-document { color: var(--mm-color-text); }
  .mm-document a { text-decoration: none; }
  .mm-document h1,
  .mm-document h2,
  .mm-document h3 { break-before: auto; }
  .mm-document pre,
  .mm-document figure,
  .mm-document .mm-callout,
  .mm-document .mm-cover,
  .mm-document .mm-toc { break-inside: avoid; }
  .mm-document thead { display: table-header-group; }
  .mm-document .mm-page-number::after { content: counter(page); }
}
`;

const baseCoverCss = String.raw`
.mm-document .mm-cover {
  align-items: flex-start;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 70vh;
  padding: calc(var(--mm-space-unit) * 12) 0;
}
.mm-document .mm-cover h1 { border-bottom: 0.35rem solid var(--mm-color-accent); padding-bottom: calc(var(--mm-space-unit) * 4); }
`;

function tokensCss(values: Record<string, string>): string {
  return `:root {\n${Object.entries(values)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n")}\n}`;
}

const sharedTokens = {
  "--mm-color-heading": "#20211f",
  "--mm-color-text": "#2d302b",
  "--mm-color-muted": "#6b7169",
  "--mm-color-border": "#d9ded7",
  "--mm-color-code-surface": "#f1f4f0",
  "--mm-color-callout-surface": "#f3f7f4",
  "--mm-font-body": '"Liberation Sans", Arial, "WenQuanYi Zen Hei", sans-serif',
  "--mm-font-heading": '"Liberation Serif", Georgia, "WenQuanYi Zen Hei", serif',
  "--mm-font-mono":
    '"Liberation Mono", "SFMono-Regular", Consolas, "WenQuanYi Zen Hei Mono", monospace',
  "--mm-size-body": "16px",
  "--mm-leading-body": "1.65",
  "--mm-space-unit": "4px",
  "--mm-radius": "6px",
};

const technicalContentCss = String.raw`
.mm-document h1,
.mm-document h2,
.mm-document h3,
.mm-document h4,
.mm-document h5,
.mm-document h6 {
  font-family: var(--mm-font-heading);
  font-weight: 750;
  letter-spacing: -0.02em;
}
.mm-document pre { box-shadow: inset 0.25rem 0 var(--mm-color-accent); }
.mm-document table { font-size: 0.94em; }
`;

const minimalContentCss = String.raw`
.mm-document h1,
.mm-document h2,
.mm-document h3,
.mm-document h4,
.mm-document h5,
.mm-document h6 { font-weight: 600; }
.mm-document p { max-width: 72ch; }
.mm-document .mm-callout { border-left-width: 0.2rem; }
`;

const editorialContentCss = String.raw`
.mm-document { font-size: 1.05rem; line-height: 1.78; }
.mm-document h1,
.mm-document h2,
.mm-document h3,
.mm-document h4,
.mm-document h5,
.mm-document h6 { font-weight: 500; letter-spacing: -0.025em; }
.mm-document blockquote {
  border-left: 0;
  font-family: var(--mm-font-heading);
  font-size: 1.08em;
  padding-left: calc(var(--mm-space-unit) * 2);
}
.mm-document .mm-image-caption { font-style: italic; }
`;

const technicalScreenCss = String.raw`
@media screen {
  .mm-document { max-width: 58rem; }
}
`;

const minimalScreenCss = String.raw`
@media screen {
  .mm-document { max-width: 48rem; }
}
`;

const editorialScreenCss = String.raw`
@media screen {
  .mm-document { max-width: 50rem; }
}
`;

function createStyles(
  accent: string,
  surface: string,
  fontBody: string,
  fontHeading: string,
  contentVariant: string,
  screenVariant: string,
): ThemeStyles {
  return {
    contentCss: `${baseContentCss}\n${contentVariant}`,
    coverCss: baseCoverCss,
    printCss: basePrintCss,
    screenCss: `${baseScreenCss}\n${screenVariant}`,
    tokensCss: tokensCss({
      ...sharedTokens,
      "--mm-color-accent": accent,
      "--mm-color-callout-surface": surface,
      "--mm-font-body": fontBody,
      "--mm-font-heading": fontHeading,
    }),
  };
}

export const technicalMintStyles = createStyles(
  "#2f735f",
  "#f3f7f4",
  '"Liberation Sans", Arial, "WenQuanYi Zen Hei", sans-serif',
  '"Liberation Sans", Arial, "WenQuanYi Zen Hei", sans-serif',
  technicalContentCss,
  technicalScreenCss,
);
export const minimalReportStyles = createStyles(
  "#44546a",
  "#f4f6f8",
  '"Liberation Sans", Arial, "WenQuanYi Zen Hei", sans-serif',
  '"Liberation Sans", Arial, "WenQuanYi Zen Hei", sans-serif',
  minimalContentCss,
  minimalScreenCss,
);
export const editorialSerifStyles = createStyles(
  "#8b4c35",
  "#fbf2e8",
  '"Liberation Serif", Georgia, "WenQuanYi Zen Hei", serif',
  '"Liberation Serif", Georgia, "WenQuanYi Zen Hei", serif',
  editorialContentCss,
  editorialScreenCss,
);
