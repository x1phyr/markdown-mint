import type { ThemeManifest } from "@markdown-mint/theme-sdk";

export interface ThemeStyles {
  contentCss: string;
  printCss: string;
  screenCss: string;
  tokensCss: string;
}

export interface ThemeBundle {
  manifest: ThemeManifest;
  styles: ThemeStyles;
}

export function combineThemeCss(styles: ThemeStyles): string {
  return [styles.tokensCss, styles.contentCss, styles.screenCss, styles.printCss]
    .filter(Boolean)
    .join("\n");
}
