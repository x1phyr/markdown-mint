import { defineTheme } from "@markdown-mint/theme-sdk";
import type { ThemeBundle, ThemeManifest, ThemeTokenDefinition } from "@markdown-mint/theme-sdk";

import { editorialSerifStyles, minimalReportStyles, technicalMintStyles } from "./styles.js";

const sharedTokenDefinitions: Record<string, ThemeTokenDefinition> = {
  "--mm-color-heading": {
    default: "#20211f",
    description: "Heading text color.",
    type: "color",
    userOverridable: false,
  },
  "--mm-color-text": {
    default: "#2d302b",
    description: "Body text color.",
    type: "color",
    userOverridable: false,
  },
  "--mm-color-muted": {
    default: "#6b7169",
    description: "Secondary text color.",
    type: "color",
    userOverridable: false,
  },
  "--mm-color-border": {
    default: "#d9ded7",
    description: "Border and divider color.",
    type: "color",
    userOverridable: false,
  },
  "--mm-color-code-surface": {
    default: "#f1f4f0",
    description: "Inline code and table header surface.",
    type: "color",
    userOverridable: false,
  },
  "--mm-color-callout-surface": {
    default: "#f3f7f4",
    description: "Callout background color.",
    type: "color",
    userOverridable: false,
  },
  "--mm-color-accent": {
    default: "#2f735f",
    description: "Primary accent used for links, rules, and callouts.",
    type: "color",
    userOverridable: true,
  },
  "--mm-font-body": {
    default: '"Liberation Sans", Arial, "WenQuanYi Zen Hei", sans-serif',
    description: "Body font stack.",
    type: "font-family",
    userOverridable: true,
  },
  "--mm-font-heading": {
    default: '"Liberation Serif", Georgia, "WenQuanYi Zen Hei", serif',
    description: "Heading font stack.",
    type: "font-family",
    userOverridable: true,
  },
  "--mm-font-mono": {
    default: '"Liberation Mono", "SFMono-Regular", Consolas, "WenQuanYi Zen Hei Mono", monospace',
    description: "Code font stack.",
    type: "font-family",
    userOverridable: false,
  },
  "--mm-size-body": {
    default: "16px",
    description: "Base body font size.",
    type: "length",
    userOverridable: true,
  },
  "--mm-leading-body": {
    default: "1.65",
    description: "Base body line height.",
    type: "number",
    userOverridable: true,
  },
  "--mm-space-unit": {
    default: "4px",
    description: "Base spacing unit.",
    type: "length",
    userOverridable: true,
  },
  "--mm-radius": {
    default: "6px",
    description: "Small surface corner radius.",
    type: "length",
    userOverridable: false,
  },
};

function themeTokens(
  accent: `#${string}`,
  calloutSurface: `#${string}`,
  fontBody: string,
  fontHeading: string,
): ThemeManifest["tokens"] {
  return {
    ...sharedTokenDefinitions,
    "--mm-color-accent": { ...sharedTokenDefinitions["--mm-color-accent"], default: accent },
    "--mm-color-callout-surface": {
      ...sharedTokenDefinitions["--mm-color-callout-surface"],
      default: calloutSurface,
    },
    "--mm-font-body": { ...sharedTokenDefinitions["--mm-font-body"], default: fontBody },
    "--mm-font-heading": { ...sharedTokenDefinitions["--mm-font-heading"], default: fontHeading },
  } as ThemeManifest["tokens"];
}

const sharedCapabilities = {
  callouts: true,
  codeBlocks: true,
  cover: true,
  footnotes: true,
  images: true,
  math: true,
  mermaid: true,
  pageFooter: true,
  pageHeader: true,
  tables: true,
  toc: true,
} as const;

const sharedCompatibility = {
  compiledDocument: 1,
  compiler: ">=0.1.0 <1.0.0",
} as const;

const sharedOutputs = ["html", "pdf"] as const;

function baseManifest(
  values: Omit<
    ThemeManifest,
    "capabilities" | "compatibility" | "outputs" | "schemaVersion" | "tokens"
  > & {
    accent: `#${string}`;
    calloutSurface: `#${string}`;
    fontBody: string;
    fontHeading: string;
  },
): ThemeManifest {
  const { accent, calloutSurface, fontBody, fontHeading, ...manifest } = values;
  return {
    ...manifest,
    capabilities: sharedCapabilities,
    compatibility: sharedCompatibility,
    defaults: { ...manifest.defaults, accentColor: accent },
    outputs: sharedOutputs,
    schemaVersion: 1,
    tokens: themeTokens(accent, calloutSurface, fontBody, fontHeading),
  };
}

export const technicalMint = defineTheme(
  baseManifest({
    accent: "#2f735f",
    calloutSurface: "#f3f7f4",
    category: "technical",
    defaults: {
      accentColor: "#2f735f",
      codeTheme: "github-light",
      density: "normal",
      pageSize: "A4",
    },
    description: "Technical documents, architecture proposals, and API guides.",
    fontBody: '"Liberation Sans", Arial, "WenQuanYi Zen Hei", sans-serif',
    fontHeading: '"Liberation Sans", Arial, "WenQuanYi Zen Hei", sans-serif',
    id: "technical-mint",
    name: "Technical Mint",
    version: "0.1.0",
  }),
);

export const minimalReport = defineTheme(
  baseManifest({
    accent: "#44546a",
    calloutSurface: "#f4f6f8",
    category: "business",
    defaults: {
      accentColor: "#44546a",
      codeTheme: "github-light",
      density: "normal",
      pageSize: "A4",
    },
    description: "PRDs, project summaries, meeting packets, and business reports.",
    fontBody: '"Liberation Sans", Arial, "WenQuanYi Zen Hei", sans-serif',
    fontHeading: '"Liberation Sans", Arial, "WenQuanYi Zen Hei", sans-serif',
    id: "minimal-report",
    name: "Minimal Report",
    version: "0.1.0",
  }),
);

export const editorialSerif = defineTheme(
  baseManifest({
    accent: "#8b4c35",
    calloutSurface: "#fbf2e8",
    category: "editorial",
    defaults: {
      accentColor: "#8b4c35",
      codeTheme: "github-light",
      density: "relaxed",
      pageSize: "A4",
    },
    description: "Essays, tutorials, newsletters, and long-form publishing.",
    fontBody: '"Liberation Serif", Georgia, "WenQuanYi Zen Hei", serif',
    fontHeading: '"Liberation Serif", Georgia, "WenQuanYi Zen Hei", serif',
    id: "editorial-serif",
    name: "Editorial Serif",
    version: "0.1.0",
  }),
);

export const launchThemes = [technicalMint, minimalReport, editorialSerif] as const;

export const launchThemeBundles: readonly ThemeBundle[] = [
  { manifest: technicalMint, styles: technicalMintStyles },
  { manifest: minimalReport, styles: minimalReportStyles },
  { manifest: editorialSerif, styles: editorialSerifStyles },
];

export { getThemeDetails, launchThemeDetails } from "./details.js";
export { launchPreviewBodyHtml, launchPreviewMarkdown } from "./preview.js";
export { editorialSerifStyles, minimalReportStyles, technicalMintStyles };
