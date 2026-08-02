export type ThemeCategory = "business" | "editorial" | "technical";

export interface ThemeCapabilities {
  codeBlocks: boolean;
  cover: boolean;
  footnotes: boolean;
  pageFooter: boolean;
  pageHeader: boolean;
  toc: boolean;
}

export interface ThemeDefaults {
  accentColor: `#${string}`;
  codeTheme: string;
  density: "compact" | "normal" | "relaxed";
  pageSize: "A4" | "Letter";
}

export interface ThemeManifest {
  capabilities: ThemeCapabilities;
  category: ThemeCategory;
  defaults: ThemeDefaults;
  description: string;
  id: string;
  name: string;
  version: `${number}.${number}.${number}`;
}

export function defineTheme<const T extends ThemeManifest>(manifest: T): T {
  return manifest;
}
