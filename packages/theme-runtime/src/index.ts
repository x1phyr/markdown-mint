import type {
  ThemeBundle,
  ThemeManifest,
  ThemeOverrideResult,
  ThemeStyles,
  ThemeValidationIssue,
} from "@markdown-mint/theme-sdk";
import { validateThemeManifest, validateThemeTokenValue } from "@markdown-mint/theme-sdk";

export type { ThemeBundle, ThemeStyles } from "@markdown-mint/theme-sdk";

const CSS_LAYER_NAMES = ["tokensCss", "contentCss", "coverCss", "screenCss", "printCss"] as const;

function cssIssue(path: string, rule: string, message: string): ThemeValidationIssue {
  return { message, path, rule };
}

const CSS_TOKEN_PREFIX = "--mm-";

function isCssTokenNameChar(code: number): boolean {
  return (
    code === 0x2d ||
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a)
  );
}

function isCssWhitespace(code: number): boolean {
  return code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d || code === 0x20;
}

function findTokenNames(css: string): string[] {
  const names: string[] = [];
  let searchFrom = 0;
  while (searchFrom < css.length) {
    const start = css.indexOf(CSS_TOKEN_PREFIX, searchFrom);
    if (start < 0) break;

    let end = start + CSS_TOKEN_PREFIX.length;
    while (end < css.length && isCssTokenNameChar(css.charCodeAt(end))) end += 1;

    if (end > start + CSS_TOKEN_PREFIX.length) {
      let cursor = end;
      while (cursor < css.length && isCssWhitespace(css.charCodeAt(cursor))) cursor += 1;
      if (css[cursor] === ":") names.push(css.slice(start, end));
    }
    searchFrom = Math.max(end, start + CSS_TOKEN_PREFIX.length);
  }
  return names;
}

function findCssHazards(css: string): string[] {
  const hazards: string[] = [];
  if (/@import\b/iu.test(css)) hazards.push("@import");
  if (/<script\b|javascript:|expression\s*\(|behavior\s*:/iu.test(css))
    hazards.push("executable CSS");
  if (/url\s*\(/iu.test(css)) hazards.push("external url()");
  return hazards;
}

export function combineThemeCss(styles: ThemeStyles): string {
  return CSS_LAYER_NAMES.map((name) => styles[name] ?? "")
    .filter(Boolean)
    .join("\n");
}

export interface ThemeBundleValidationResult {
  issues: ThemeValidationIssue[];
  valid: boolean;
}

export function validateThemeBundle(bundle: unknown): ThemeBundleValidationResult {
  if (!bundle || typeof bundle !== "object") {
    return {
      issues: [cssIssue("$", "bundle-object", "Theme bundle must be an object.")],
      valid: false,
    };
  }
  const candidate = bundle as { manifest?: unknown; styles?: unknown };
  const manifestResult = validateThemeManifest(candidate.manifest);
  const issues = [...manifestResult.issues];
  if (!candidate.styles || typeof candidate.styles !== "object") {
    issues.push(cssIssue("styles", "styles-object", "Theme bundle styles must be an object."));
    return { issues, valid: false };
  }

  const styles = candidate.styles as Record<string, unknown>;
  for (const layer of CSS_LAYER_NAMES) {
    if (layer === "coverCss" && styles[layer] === undefined) continue;
    if (typeof styles[layer] !== "string" || !styles[layer].trim()) {
      issues.push(
        cssIssue(
          `styles.${layer}`,
          "styles-layer",
          `Theme CSS layer ${layer} must be a non-empty string.`,
        ),
      );
    }
  }

  const manifest = candidate.manifest as ThemeManifest | undefined;
  const declaredTokens = new Set(
    manifest && "tokens" in manifest ? Object.keys(manifest.tokens) : [],
  );
  for (const layer of CSS_LAYER_NAMES) {
    const css = typeof styles[layer] === "string" ? styles[layer] : "";
    for (const hazard of findCssHazards(css)) {
      issues.push(
        cssIssue(`styles.${layer}`, "css-safety", `Theme CSS contains forbidden ${hazard}.`),
      );
    }
    for (const token of findTokenNames(css)) {
      if (!declaredTokens.has(token)) {
        issues.push(
          cssIssue(
            `styles.${layer}`,
            "undeclared-token",
            `Theme CSS uses undeclared token ${token}.`,
          ),
        );
      }
    }
  }

  const contentCss = typeof styles.contentCss === "string" ? styles.contentCss : "";
  const printCss = typeof styles.printCss === "string" ? styles.printCss : "";
  if (!/\.mm-document\b/u.test(contentCss)) {
    issues.push(
      cssIssue("styles.contentCss", "semantic-root", "Content CSS must target .mm-document."),
    );
  }
  if (!/@media\s+print/iu.test(printCss)) {
    issues.push(
      cssIssue("styles.printCss", "print-layer", "Print CSS must declare an @media print layer."),
    );
  }

  return { issues, valid: issues.length === 0 };
}

export function assertValidThemeBundle(bundle: ThemeBundle): ThemeBundle {
  const result = validateThemeBundle(bundle);
  if (!result.valid) {
    throw new Error(
      `Invalid theme bundle: ${result.issues.map((item) => `${item.path}: ${item.message}`).join("; ")}`,
    );
  }
  return bundle;
}

export function applyThemeOverrides(
  manifest: ThemeManifest,
  overrides: Record<string, string>,
): ThemeOverrideResult {
  const values: Record<string, string> = {};
  const issues: ThemeValidationIssue[] = [];

  for (const [token, value] of Object.entries(overrides)) {
    const definition = manifest.tokens[token as keyof typeof manifest.tokens];
    if (!definition) {
      issues.push(
        cssIssue(`overrides.${token}`, "unknown-token", "Token is not declared by this theme."),
      );
      continue;
    }
    if (!definition.userOverridable) {
      issues.push(
        cssIssue(
          `overrides.${token}`,
          "token-locked",
          "Token is declared but not user-overridable.",
        ),
      );
      continue;
    }
    if (!validateThemeTokenValue(definition, value)) {
      issues.push(
        cssIssue(
          `overrides.${token}`,
          "token-value",
          "Token value is not valid for its declared type.",
        ),
      );
      continue;
    }
    values[token] = value;
  }

  const css = Object.entries(values).length
    ? `:root {\n${Object.entries(values)
        .map(([token, value]) => `  ${token}: ${value};`)
        .join("\n")}\n}`
    : "";
  return { css, issues, values };
}

export function createThemeCss(
  bundle: ThemeBundle,
  overrides: Record<string, string> = {},
): ThemeOverrideResult & { css: string } {
  assertValidThemeBundle(bundle);
  const applied = applyThemeOverrides(bundle.manifest, overrides);
  return {
    ...applied,
    css: [combineThemeCss(bundle.styles), applied.css].filter(Boolean).join("\n"),
  };
}

export interface ThemePreviewOptions {
  bodyHtml: string;
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

export function createThemePreviewHtml(
  bundle: ThemeBundle,
  options: ThemePreviewOptions,
  overrides: Record<string, string> = {},
): ThemeOverrideResult & { html: string } {
  const rendered = createThemeCss(bundle, overrides);
  const language = escapeHtml(options.language ?? "zh-CN");
  const title = escapeHtml(options.title);
  return {
    ...rendered,
    html: `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <style>${rendered.css}</style>
  </head>
  <body>
    <main class="mm-document">${options.bodyHtml}</main>
  </body>
</html>`,
  };
}
