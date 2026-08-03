export const THEME_MANIFEST_VERSION = 1 as const;

export type ThemeCategory = "business" | "editorial" | "technical";
export type ThemeOutputFormat = "html" | "pdf";
export type ThemeTokenType = "color" | "font-family" | "length" | "number" | "string";

export interface ThemeCapabilities {
  callouts: boolean;
  codeBlocks: boolean;
  cover: boolean;
  footnotes: boolean;
  images: boolean;
  math: boolean;
  mermaid: boolean;
  pageFooter: boolean;
  pageHeader: boolean;
  tables: boolean;
  toc: boolean;
}

export interface ThemeDefaults {
  accentColor: `#${string}`;
  codeTheme: string;
  density: "compact" | "normal" | "relaxed";
  pageSize: "A4" | "Letter";
}

export interface ThemeTokenDefinition {
  default: string;
  description: string;
  type: ThemeTokenType;
  userOverridable: boolean;
}

export interface ThemeCompatibility {
  compiledDocument: 1;
  compiler: string;
}

export interface ThemeManifest {
  capabilities: ThemeCapabilities;
  category: ThemeCategory;
  compatibility: ThemeCompatibility;
  defaults: ThemeDefaults;
  description: string;
  id: string;
  name: string;
  outputs: readonly ThemeOutputFormat[];
  schemaVersion: typeof THEME_MANIFEST_VERSION;
  tokens: Readonly<Record<`--mm-${string}`, ThemeTokenDefinition>>;
  version: `${number}.${number}.${number}`;
}

export interface ThemeStyles {
  contentCss: string;
  coverCss?: string;
  printCss: string;
  screenCss: string;
  tokensCss: string;
}

export interface ThemeBundle {
  manifest: ThemeManifest;
  styles: ThemeStyles;
}

export interface ThemeValidationIssue {
  message: string;
  path: string;
  rule: string;
}

export interface ThemeValidationResult {
  issues: ThemeValidationIssue[];
  valid: boolean;
}

export interface ThemeOverrideResult {
  css: string;
  issues: ThemeValidationIssue[];
  values: Record<string, string>;
}

const THEME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const CSS_LENGTH_PATTERN = /^(?:0|\d+(?:\.\d+)?(?:px|pt|pc|mm|cm|in|rem|em|ch|ex|vw|vh|%))$/i;
const CSS_NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/;
const SAFE_CSS_VALUE_PATTERN = /^[\w\s.,#%()+/'"-]+$/u;

const REQUIRED_CAPABILITIES: readonly (keyof ThemeCapabilities)[] = [
  "callouts",
  "codeBlocks",
  "cover",
  "footnotes",
  "images",
  "math",
  "mermaid",
  "pageFooter",
  "pageHeader",
  "tables",
  "toc",
];

function issue(path: string, rule: string, message: string): ThemeValidationIssue {
  return { message, path, rule };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isThemeTokenType(value: unknown): value is ThemeTokenType {
  return (
    value === "color" ||
    value === "font-family" ||
    value === "length" ||
    value === "number" ||
    value === "string"
  );
}

export function validateThemeManifest(input: unknown): ThemeValidationResult {
  const issues: ThemeValidationIssue[] = [];
  if (!isRecord(input))
    return {
      issues: [issue("$", "manifest-object", "Theme manifest must be an object.")],
      valid: false,
    };

  if (input.schemaVersion !== THEME_MANIFEST_VERSION) {
    issues.push(
      issue("schemaVersion", "manifest-version", "Theme manifest schemaVersion must be 1."),
    );
  }
  if (typeof input.id !== "string" || !THEME_ID_PATTERN.test(input.id)) {
    issues.push(issue("id", "theme-id", "Theme id must use lowercase kebab-case."));
  }
  if (typeof input.name !== "string" || !input.name.trim()) {
    issues.push(issue("name", "theme-name", "Theme name must be a non-empty string."));
  }
  if (typeof input.description !== "string" || !input.description.trim()) {
    issues.push(
      issue("description", "theme-description", "Theme description must be a non-empty string."),
    );
  }
  if (
    input.category !== "business" &&
    input.category !== "editorial" &&
    input.category !== "technical"
  ) {
    issues.push(issue("category", "theme-category", "Theme category is not supported."));
  }
  if (typeof input.version !== "string" || !SEMVER_PATTERN.test(input.version)) {
    issues.push(issue("version", "theme-version", "Theme version must be a semantic version."));
  }

  if (!isRecord(input.compatibility)) {
    issues.push(
      issue("compatibility", "theme-compatibility", "Theme compatibility must be declared."),
    );
  } else {
    if (input.compatibility.compiledDocument !== 1) {
      issues.push(
        issue(
          "compatibility.compiledDocument",
          "compiled-document-version",
          "Theme must consume CompiledDocument v1.",
        ),
      );
    }
    if (typeof input.compatibility.compiler !== "string" || !input.compatibility.compiler.trim()) {
      issues.push(
        issue(
          "compatibility.compiler",
          "compiler-range",
          "Theme compiler compatibility must be declared.",
        ),
      );
    }
  }

  if (
    !Array.isArray(input.outputs) ||
    input.outputs.length === 0 ||
    input.outputs.some((value) => value !== "html" && value !== "pdf")
  ) {
    issues.push(
      issue("outputs", "theme-outputs", "Theme must support at least one of html or pdf."),
    );
  }

  if (!isRecord(input.capabilities)) {
    issues.push(
      issue("capabilities", "theme-capabilities", "Theme capabilities must be declared."),
    );
  } else {
    for (const capability of REQUIRED_CAPABILITIES) {
      if (typeof input.capabilities[capability] !== "boolean") {
        issues.push(
          issue(
            `capabilities.${capability}`,
            "theme-capability",
            "Theme capability must be a boolean.",
          ),
        );
      }
    }
  }

  if (!isRecord(input.defaults)) {
    issues.push(issue("defaults", "theme-defaults", "Theme defaults must be declared."));
  } else {
    if (
      typeof input.defaults.accentColor !== "string" ||
      !HEX_COLOR_PATTERN.test(input.defaults.accentColor)
    ) {
      issues.push(
        issue(
          "defaults.accentColor",
          "theme-accent",
          "Theme accentColor must be a six-digit hex color.",
        ),
      );
    }
    if (typeof input.defaults.codeTheme !== "string" || !input.defaults.codeTheme.trim()) {
      issues.push(
        issue(
          "defaults.codeTheme",
          "theme-code-theme",
          "Theme codeTheme must be a non-empty string.",
        ),
      );
    }
    if (
      !(["compact", "normal", "relaxed"] as const).includes(
        input.defaults.density as "compact" | "normal" | "relaxed",
      )
    ) {
      issues.push(issue("defaults.density", "theme-density", "Theme density is not supported."));
    }
    if (input.defaults.pageSize !== "A4" && input.defaults.pageSize !== "Letter") {
      issues.push(
        issue("defaults.pageSize", "theme-page-size", "Theme pageSize must be A4 or Letter."),
      );
    }
  }

  if (!isRecord(input.tokens)) {
    issues.push(issue("tokens", "theme-tokens", "Theme must declare its design tokens."));
  } else {
    for (const [tokenName, definition] of Object.entries(input.tokens)) {
      if (!tokenName.startsWith("--mm-") || !/^--mm-[a-z0-9-]+$/u.test(tokenName)) {
        issues.push(
          issue(
            `tokens.${tokenName}`,
            "token-name",
            "Theme token names must start with --mm- and use kebab-case.",
          ),
        );
      }
      if (!isRecord(definition)) {
        issues.push(
          issue(
            `tokens.${tokenName}`,
            "token-definition",
            "Theme token definition must be an object.",
          ),
        );
        continue;
      }
      if (
        typeof definition.default !== "string" ||
        !SAFE_CSS_VALUE_PATTERN.test(definition.default) ||
        /[;{}<>]/u.test(definition.default)
      ) {
        issues.push(
          issue(
            `tokens.${tokenName}.default`,
            "token-value",
            "Theme token defaults must be safe CSS values.",
          ),
        );
      }
      if (typeof definition.description !== "string" || !definition.description.trim()) {
        issues.push(
          issue(
            `tokens.${tokenName}.description`,
            "token-description",
            "Theme token descriptions must be non-empty.",
          ),
        );
      }
      if (!isThemeTokenType(definition.type)) {
        issues.push(
          issue(`tokens.${tokenName}.type`, "token-type", "Theme token type is not supported."),
        );
      }
      if (typeof definition.userOverridable !== "boolean") {
        issues.push(
          issue(
            `tokens.${tokenName}.userOverridable`,
            "token-overridable",
            "Theme token userOverridable must be a boolean.",
          ),
        );
      }
    }
  }

  return { issues, valid: issues.length === 0 };
}

export function assertValidThemeManifest<const T extends ThemeManifest>(manifest: T): T {
  const result = validateThemeManifest(manifest);
  if (!result.valid) {
    throw new Error(
      `Invalid theme manifest: ${result.issues.map((item) => `${item.path}: ${item.message}`).join("; ")}`,
    );
  }
  return manifest;
}

export function defineTheme<const T extends ThemeManifest>(manifest: T): T {
  return assertValidThemeManifest(manifest);
}

export function validateThemeTokenValue(definition: ThemeTokenDefinition, value: string): boolean {
  if (!SAFE_CSS_VALUE_PATTERN.test(value) || /[;{}<>]|url\s*\(|!important/iu.test(value))
    return false;
  switch (definition.type) {
    case "color":
      return HEX_COLOR_PATTERN.test(value);
    case "length":
      return CSS_LENGTH_PATTERN.test(value);
    case "number":
      return CSS_NUMBER_PATTERN.test(value);
    case "font-family":
    case "string":
      return value.trim().length > 0;
  }
}
