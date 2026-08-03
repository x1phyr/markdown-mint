export type ThemeSampleFormat = "html" | "pdf";

export interface ThemeDetails {
  bestFor: readonly string[];
  contentCoverage: readonly string[];
  designPrinciples: readonly string[];
  id: "technical-mint" | "minimal-report" | "editorial-serif";
  sampleFixture: string;
  sampleFormats: readonly ThemeSampleFormat[];
  tagline: string;
}

const sampleFixture = "fixtures/p5-themes.md";

export const launchThemeDetails: readonly ThemeDetails[] = [
  {
    bestFor: ["architecture notes", "API guides", "engineering reports"],
    contentCoverage: ["code", "tables", "diagrams", "dense technical sections"],
    designPrinciples: ["high information density", "strong hierarchy", "quiet mint accent"],
    id: "technical-mint",
    sampleFixture,
    sampleFormats: ["html", "pdf"],
    tagline: "A precise technical surface for decisions, systems, and implementation details.",
  },
  {
    bestFor: ["PRDs", "meeting packets", "project summaries"],
    contentCoverage: ["headings", "lists", "tables", "stable print layout"],
    designPrinciples: ["restrained contrast", "predictable spacing", "print-first clarity"],
    id: "minimal-report",
    sampleFixture,
    sampleFormats: ["html", "pdf"],
    tagline: "A calm report layout that keeps business documents easy to scan and print.",
  },
  {
    bestFor: ["essays", "tutorials", "newsletters", "long-form publishing"],
    contentCoverage: ["long reading", "quotes", "images", "formulas and footnotes"],
    designPrinciples: ["editorial rhythm", "serif reading texture", "generous page pacing"],
    id: "editorial-serif",
    sampleFixture,
    sampleFormats: ["html", "pdf"],
    tagline:
      "An editorial reading rhythm for tutorials, essays, and documents with a point of view.",
  },
] as const;

export function getThemeDetails(themeId: string): ThemeDetails | undefined {
  return launchThemeDetails.find((details) => details.id === themeId);
}
