import { defineTheme } from "@markdown-mint/theme-sdk";

export const technicalMint = defineTheme({
  capabilities: {
    codeBlocks: true,
    cover: true,
    footnotes: true,
    pageFooter: true,
    pageHeader: true,
    toc: true,
  },
  category: "technical",
  defaults: {
    accentColor: "#2f735f",
    codeTheme: "github-light",
    density: "normal",
    pageSize: "A4",
  },
  description: "Technical documents, architecture proposals, and API guides.",
  id: "technical-mint",
  name: "Technical Mint",
  version: "0.1.0",
});

export const minimalReport = defineTheme({
  capabilities: {
    codeBlocks: true,
    cover: true,
    footnotes: true,
    pageFooter: true,
    pageHeader: false,
    toc: true,
  },
  category: "business",
  defaults: {
    accentColor: "#44546a",
    codeTheme: "github-light",
    density: "normal",
    pageSize: "A4",
  },
  description: "PRDs, project summaries, meeting packets, and business reports.",
  id: "minimal-report",
  name: "Minimal Report",
  version: "0.1.0",
});

export const editorialSerif = defineTheme({
  capabilities: {
    codeBlocks: true,
    cover: true,
    footnotes: true,
    pageFooter: true,
    pageHeader: false,
    toc: false,
  },
  category: "editorial",
  defaults: {
    accentColor: "#8b4c35",
    codeTheme: "github-light",
    density: "relaxed",
    pageSize: "A4",
  },
  description: "Essays, tutorials, newsletters, and long-form publishing.",
  id: "editorial-serif",
  name: "Editorial Serif",
  version: "0.1.0",
});

export const launchThemes = [technicalMint, minimalReport, editorialSerif] as const;
