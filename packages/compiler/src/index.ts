import type { Element, ElementContent, Properties, Root as HastRoot } from "hast";
import type { Handler, State } from "mdast-util-to-hast";
import type { Image, Root } from "mdast";
import { createHash } from "node:crypto";
import { fromHtml } from "hast-util-from-html";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { codeToHast } from "shiki";
import type { BundledLanguage } from "shiki";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { parse as parseYaml } from "yaml";
import { JSDOM } from "jsdom";

import { resolveResources } from "./resources.js";
import type {
  ResourceAsset,
  ResourceCandidate,
  ResourceDiagnostic,
  ResourceManifest,
  ResourcePolicy,
} from "./resources.js";

export {
  assertSafeRemoteUrl,
  DEFAULT_RESOURCE_POLICY,
  isPrivateNetworkHost,
  resolveResources,
} from "./resources.js";
export type {
  ResourceAsset,
  ResourceCandidate,
  ResourceDiagnostic,
  ResourceManifest,
  ResourceManifestEntry,
  ResourcePolicy,
  ResourceResolutionOptions,
  ResourceResolutionResult,
  ResourceStatus,
} from "./resources.js";

export const COMPILED_DOCUMENT_PROTOCOL = "markdown-mint/compiled-document" as const;
export const COMPILED_DOCUMENT_VERSION = 1 as const;
export const COMPILER_VERSION = "0.1.0" as const;

export type DiagnosticLevel = "info" | "warning" | "error";

export interface SourcePoint {
  line: number;
  column: number;
  offset?: number;
}

export interface SourcePosition {
  start: SourcePoint;
  end: SourcePoint;
}

export interface Diagnostic {
  level: DiagnosticLevel;
  rule: string;
  message: string;
  suggestion?: string;
  position?: SourcePosition;
}

export interface TocEntry {
  id: string;
  level: number;
  text: string;
  children: TocEntry[];
}

export interface DocumentMetadata {
  title?: string;
  subtitle?: string;
  author?: string;
  date?: string;
  language: string;
}

export interface CompiledResource {
  kind: "image" | "link";
  url: string;
  alt?: string;
  caption?: string;
  position?: SourcePosition;
  outputPath?: string;
}

export interface CompiledDocument {
  protocol: typeof COMPILED_DOCUMENT_PROTOCOL;
  version: typeof COMPILED_DOCUMENT_VERSION;
  compilerVersion: typeof COMPILER_VERSION;
  html: string;
  metadata: DocumentMetadata;
  toc: TocEntry[];
  resources: CompiledResource[];
  resourceManifest: ResourceManifest;
  diagnostics: Diagnostic[];

  /**
   * Compatibility view kept for the original v0.0 API. New consumers should
   * use `diagnostics` so they can render a rule, position, and suggestion.
   */
  messages: string[];
}

export type CompiledMarkdown = CompiledDocument;

export interface CompileOptions {
  assets?: readonly ResourceAsset[];
  codeTheme?: string;
  enableMath?: boolean;
  enableMermaid?: boolean;
  enableSyntaxHighlighting?: boolean;
  defaultLanguage?: string;
  filename?: string;
  headingIdPrefix?: string;
  resolveResources?: boolean;
  resourcePolicy?: Partial<ResourcePolicy>;
}

interface MarkdownData {
  hName?: string;
  hProperties?: Properties;
  highlighted?: HastRoot;
  markdownMint?: {
    resourceError?: string;
    safeUrl?: string;
  };
  mermaid?: HastRoot;
  mermaidError?: string;
}

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  alt?: string | null;
  lang?: string | null;
  meta?: string | null;
  name?: string;
  identifier?: string;
  attributes?: Record<string, string | null | undefined>;
  children?: MarkdownNode[];
  data?: MarkdownData;
  position?: SourcePosition;
}

interface CompileContext {
  diagnostics: Diagnostic[];
  metadata: DocumentMetadata;
  resources: CompiledResource[];
  resourceManifest: ResourceManifest;
  headings: TocEntry[];
  headingIds: Set<string>;
  headingIdPrefix: string;
  defaultLanguage: string;
  options: CompileOptions;
  firstHeadingTitle?: string;
}

interface HastTreeNode {
  type: string;
  tagName?: string;
  children?: HastTreeNode[];
  properties?: Record<string, unknown>;
}

const SAFE_LINK_PROTOCOLS = new Set(["http", "https", "mailto", "tel"]);
const SAFE_IMAGE_PROTOCOLS = new Set(["http", "https"]);
const SAFE_LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
const SAFE_CODE_LANGUAGE_PATTERN = /^[a-z0-9+#._-]{1,64}$/i;
const SAFE_HEADING_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const CALLOUT_TYPES = new Set([
  "caution",
  "danger",
  "important",
  "info",
  "note",
  "success",
  "tip",
  "warning",
]);

const CALLOUT_LABELS: Record<string, { en: string; zh: string }> = {
  caution: { en: "Caution", zh: "注意" },
  danger: { en: "Danger", zh: "危险" },
  important: { en: "Important", zh: "重要" },
  info: { en: "Info", zh: "信息" },
  note: { en: "Note", zh: "备注" },
  success: { en: "Success", zh: "成功" },
  tip: { en: "Tip", zh: "提示" },
  warning: { en: "Warning", zh: "警告" },
};

const generatedClass: [string, RegExp] = ["className", /^[A-Za-z][A-Za-z0-9_-]{0,96}$/];

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      generatedClass,
      "ariaHidden",
      "ariaLabel",
      "d",
      "dominantBaseline",
      "fill",
      "fillOpacity",
      "fillRule",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "markerEnd",
      "markerStart",
      "points",
      "preserveAspectRatio",
      "r",
      "rx",
      "ry",
      "role",
      "stroke",
      "strokeDasharray",
      "strokeDashoffset",
      "strokeLinecap",
      "strokeLinejoin",
      "strokeOpacity",
      "strokeWidth",
      "style",
      "textAnchor",
      "transform",
      "viewBox",
      "x",
      "x1",
      "x2",
      "y",
      "y1",
      "y2",
    ],
    annotation: ["encoding"],
    math: ["display", "xmlns"],
    svg: ["ariaLabel", "height", "role", "viewBox", "width", "xmlns"],
  },
  clobber: [],
  clobberPrefix: "",
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto", "tel"],
    src: ["http", "https"],
  },
  strip: [...(defaultSchema.strip ?? []), "iframe", "object", "embed", "style"],
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "annotation",
    "aside",
    "circle",
    "clipPath",
    "defs",
    "ellipse",
    "figcaption",
    "figure",
    "g",
    "line",
    "mark",
    "math",
    "mfrac",
    "mi",
    "mn",
    "mo",
    "mover",
    "mpadded",
    "mroot",
    "mrow",
    "ms",
    "mspace",
    "msqrt",
    "mstyle",
    "msub",
    "msubsup",
    "msup",
    "mtable",
    "mtd",
    "mtext",
    "mtr",
    "munder",
    "munderover",
    "path",
    "polygon",
    "polyline",
    "rect",
    "semantics",
    "svg",
    "text",
    "tspan",
  ],
};

function toMarkdownNode(value: unknown): MarkdownNode {
  return value as MarkdownNode;
}

function getPosition(node: MarkdownNode): SourcePosition | undefined {
  if (!node.position) return undefined;

  return {
    start: { ...node.position.start },
    end: { ...node.position.end },
  };
}

function addDiagnostic(
  context: CompileContext,
  diagnostic: Omit<Diagnostic, "position"> & { node?: MarkdownNode },
): void {
  const { node, ...rest } = diagnostic;
  const position = node ? getPosition(node) : undefined;
  context.diagnostics.push({
    ...rest,
    ...(position ? { position } : {}),
  });
}

function textContent(node: MarkdownNode): string {
  if (node.type === "image") return node.alt ?? "";
  if (node.type === "break") return " ";
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(textContent).join("");
}

function normalizedText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function mergeData(node: MarkdownNode, data: MarkdownData): void {
  node.data = {
    ...node.data,
    ...data,
    ...(data.hProperties
      ? {
          hProperties: {
            ...(node.data?.hProperties ?? {}),
            ...data.hProperties,
          },
        }
      : {}),
  };
}

function normalizeHeadingId(value: string, prefix: string): string {
  const slug = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  const base = slug || "section";
  const safePrefix = prefix.replace(/[^A-Za-z0-9_-]/gu, "-");
  const candidate = `${safePrefix}${base}`;

  return SAFE_HEADING_ID_PATTERN.test(candidate) ? candidate : `mm-${base}`;
}

function uniqueHeadingId(context: CompileContext, text: string): string {
  const base = normalizeHeadingId(text, context.headingIdPrefix);
  let id = base;
  let suffix = 2;

  while (context.headingIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }

  context.headingIds.add(id);
  return id;
}

function parseFrontmatter(root: Root, context: CompileContext): void {
  const rootNode = root as unknown as MarkdownNode & { children: MarkdownNode[] };
  const frontmatterNodes = rootNode.children.filter(
    (node) => node.type === "yaml" || node.type === "toml",
  );

  for (const node of frontmatterNodes) {
    if (node.type !== "yaml") {
      addDiagnostic(context, {
        level: "warning",
        rule: "frontmatter-format",
        message: "Only YAML frontmatter is supported; the TOML block was ignored.",
        suggestion: "Use a YAML frontmatter block delimited by `---`.",
        node,
      });
      continue;
    }

    try {
      const parsed = parseYaml(node.value ?? "");
      if (parsed === null || parsed === undefined) continue;

      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        addDiagnostic(context, {
          level: "error",
          rule: "frontmatter-object",
          message: "Frontmatter must contain a YAML object.",
          suggestion: "Use key/value fields such as `title: Project brief`.",
          node,
        });
        continue;
      }

      const metadata = parsed as Record<string, unknown>;
      const supportedFields = new Set(["author", "date", "language", "subtitle", "title"]);

      for (const [key, value] of Object.entries(metadata)) {
        if (!supportedFields.has(key)) {
          addDiagnostic(context, {
            level: "warning",
            rule: "frontmatter-field",
            message: `Frontmatter field \`${key}\` is not used by the compiler.`,
            suggestion: "Keep document metadata to title, subtitle, author, date, and language.",
            node,
          });
          continue;
        }

        if (value === null || value === undefined) continue;
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
          addDiagnostic(context, {
            level: "warning",
            rule: "frontmatter-value",
            message: `Frontmatter field \`${key}\` must be a scalar value.`,
            suggestion: "Wrap a text value in quotes and keep arrays out of document metadata.",
            node,
          });
          continue;
        }

        const normalized = String(value).trim();
        if (!normalized) continue;

        if (key === "language") {
          if (!SAFE_LANGUAGE_PATTERN.test(normalized)) {
            addDiagnostic(context, {
              level: "warning",
              rule: "frontmatter-language",
              message: `Unsupported document language \`${normalized}\`; using ${context.defaultLanguage}.`,
              suggestion: "Use a BCP 47 language tag such as `zh-CN` or `en`.",
              node,
            });
          } else {
            context.metadata.language = normalized;
          }
          continue;
        }

        if (key === "title" || key === "subtitle" || key === "author" || key === "date") {
          context.metadata[key] = normalized;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid YAML frontmatter.";
      addDiagnostic(context, {
        level: "error",
        rule: "frontmatter-yaml",
        message: `Frontmatter could not be parsed: ${message}`,
        suggestion: "Check indentation, quoting, and the closing `---` delimiter.",
        node,
      });
    }
  }

  rootNode.children = rootNode.children.filter(
    (node) => node.type !== "yaml" && node.type !== "toml",
  );
}

function decodeForProtocol(value: string): string {
  let decoded = value;
  for (let index = 0; index < 2; index += 1) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      break;
    }
  }
  return Array.from(decoded)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 0x20 && code !== 0x7f;
    })
    .join("")
    .replaceAll("\\", "/");
}

function stripControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join("");
}

function normalizeUrl(
  rawUrl: string,
  kind: "image" | "link",
  context: CompileContext,
  node: MarkdownNode,
): string | undefined {
  const value = rawUrl.trim();
  if (!value) return undefined;

  const decoded = decodeForProtocol(value);
  const protocol = /^([a-z][a-z0-9+.-]*):/iu.exec(decoded)?.[1]?.toLowerCase();
  const allowedProtocols = kind === "image" ? SAFE_IMAGE_PROTOCOLS : SAFE_LINK_PROTOCOLS;

  if (protocol && !allowedProtocols.has(protocol)) {
    addDiagnostic(context, {
      level: "warning",
      rule: "unsafe-url",
      message: `Blocked unsafe ${kind} URL using the \`${protocol}:\` protocol.`,
      suggestion:
        kind === "image"
          ? "Use an https URL or a relative local asset path."
          : "Use an https, http, mailto, tel, or relative URL.",
      node,
    });
    return undefined;
  }

  if (decoded.startsWith("//") || decoded.startsWith("/") || decoded.startsWith("./")) {
    return encodeURI(stripControlCharacters(value));
  }

  if (!protocol && !decoded.startsWith("#") && !decoded.startsWith("?")) {
    return encodeURI(stripControlCharacters(value));
  }

  return encodeURI(stripControlCharacters(value));
}

function normalizeCode(node: MarkdownNode, context: CompileContext): void {
  if (node.value) node.value = node.value.replace(/\r\n?/gu, "\n");
  if (!node.lang) return;

  const language = node.lang.trim().split(/\s+/u)[0]?.toLowerCase() ?? "";
  if (!language || !SAFE_CODE_LANGUAGE_PATTERN.test(language)) {
    addDiagnostic(context, {
      level: "warning",
      rule: "code-language",
      message: "The code fence language was discarded because it contains unsafe characters.",
      suggestion: "Use a short language identifier such as `ts`, `python`, or `bash`.",
      node,
    });
    node.lang = null;
    return;
  }

  node.lang = language;
}

function stableShortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function setMermaidGlobals(dom: JSDOM): void {
  const globals: Record<string, unknown> = {
    CSSStyleSheet: dom.window.CSSStyleSheet,
    DOMParser: dom.window.DOMParser,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    SVGElement: dom.window.SVGElement,
    document: dom.window.document,
    window: dom.window,
  };

  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value,
      writable: true,
    });
  }
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
    writable: true,
  });

  Object.defineProperty(dom.window.SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => ({ height: 20, width: 100, x: 0, y: 0 }),
  });
  Object.defineProperty(dom.window.SVGElement.prototype, "getComputedTextLength", {
    configurable: true,
    value: () => 100,
  });
}

function saveGlobalDescriptors(
  keys: readonly string[],
): Map<string, PropertyDescriptor | undefined> {
  return new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
}

function restoreGlobalDescriptors(descriptors: Map<string, PropertyDescriptor | undefined>): void {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as Record<string, unknown>)[key];
  }
}

const MERMAID_GLOBAL_KEYS = [
  "CSSStyleSheet",
  "DOMParser",
  "Element",
  "HTMLElement",
  "Node",
  "SVGElement",
  "document",
  "navigator",
  "window",
] as const;

let mermaidRenderQueue = Promise.resolve();

async function renderMermaidIsolated(source: string): Promise<string> {
  const task = mermaidRenderQueue.then(async () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const descriptors = saveGlobalDescriptors(MERMAID_GLOBAL_KEYS);
    try {
      setMermaidGlobals(dom);
      const mermaidModule = await import("mermaid");
      const mermaid = mermaidModule.default;
      mermaid.initialize({
        deterministicIDSeed: "markdown-mint",
        deterministicIds: true,
        securityLevel: "strict",
        startOnLoad: false,
      });
      const result = await mermaid.render(`mm-mermaid-${stableShortHash(source)}`, source);
      return result.svg;
    } finally {
      restoreGlobalDescriptors(descriptors);
      dom.window.close();
    }
  });
  mermaidRenderQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

function sanitizeSvgTree(root: HastTreeNode): void {
  const children = root.children ?? [];
  root.children = children.filter((child) => {
    if (child.type !== "element") return true;
    const tagName = child.tagName?.toLowerCase();
    return tagName !== "script" && tagName !== "foreignobject" && tagName !== "style";
  });

  for (const child of root.children) {
    if (child.properties) {
      for (const [key, value] of Object.entries(child.properties)) {
        if (key.toLowerCase().startsWith("on")) delete child.properties[key];
        if (
          (key === "href" || key === "xLinkHref" || key === "xlink:href") &&
          typeof value === "string" &&
          !value.startsWith("#")
        ) {
          delete child.properties[key];
        }
        if (
          key === "style" &&
          typeof value === "string" &&
          /url\(|expression\(|javascript:/iu.test(value)
        ) {
          delete child.properties[key];
        }
      }
    }
    sanitizeSvgTree(child);
  }
}

async function enrichCodeNodes(root: Root, context: CompileContext): Promise<void> {
  const codeNodes: MarkdownNode[] = [];
  visit(root, (node) => {
    const current = toMarkdownNode(node);
    if (current.type === "code") codeNodes.push(current);
  });

  for (const node of codeNodes) {
    const language = node.lang?.toLowerCase();
    const source = node.value ?? "";

    if (language === "mermaid") {
      if (context.options.enableMermaid === false) {
        node.data = { ...node.data, mermaidError: "mermaid-disabled" };
        addDiagnostic(context, {
          level: "warning",
          rule: "mermaid-disabled",
          message: "Mermaid rendering is disabled for this compilation.",
          suggestion: "Enable the isolated Mermaid renderer or use a static image.",
          node,
        });
        continue;
      }

      try {
        if (/%%\{|\bclick\s+/iu.test(source)) {
          throw new Error("Interactive Mermaid directives are not allowed.");
        }
        const svg = await renderMermaidIsolated(source);
        const tree = fromHtml(svg, { fragment: true }) as unknown as HastTreeNode;
        sanitizeSvgTree(tree);
        node.data = { ...node.data, mermaid: tree as unknown as HastRoot };
      } catch {
        node.data = { ...node.data, mermaidError: "mermaid-render" };
        addDiagnostic(context, {
          level: "warning",
          rule: "mermaid-render",
          message: "Mermaid diagram could not be rendered; a visible placeholder was emitted.",
          suggestion: "Check the Mermaid syntax and avoid interactive directives or embedded HTML.",
          node,
        });
      }
      continue;
    }

    if (context.options.enableSyntaxHighlighting === false || !language) continue;

    try {
      const highlighted = await codeToHast(source, {
        lang: language as BundledLanguage,
        theme: context.options.codeTheme ?? "github-light",
      });
      node.data = { ...node.data, highlighted };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown syntax highlighting error.";
      addDiagnostic(context, {
        level: "warning",
        rule: "code-highlight",
        message: `Static syntax highlighting failed; the plain code block was kept. ${reason}`,
        suggestion: "Use a supported Shiki language identifier or omit the fence language.",
        node,
      });
    }
  }
}

async function applyResourceResolution(root: Root, context: CompileContext): Promise<void> {
  if (!context.options.resolveResources && !context.options.assets?.length) return;

  const candidates: ResourceCandidate[] = context.resources
    .filter(
      (resource): resource is CompiledResource & { kind: "image" } => resource.kind === "image",
    )
    .map((resource) => ({ kind: "image", url: resource.url }));
  const resolutionOptions = {
    ...(context.options.assets ? { assets: context.options.assets } : {}),
    ...(context.options.resourcePolicy ? { policy: context.options.resourcePolicy } : {}),
  };
  const result = await resolveResources(candidates, resolutionOptions);
  context.resourceManifest = result.manifest;

  const diagnosticBySource = new Map<string, ResourceDiagnostic>();
  for (const diagnostic of result.diagnostics)
    diagnosticBySource.set(diagnostic.source, diagnostic);

  visit(root, (node) => {
    const current = toMarkdownNode(node);
    if (current.type !== "image") return;
    const source = current.data?.markdownMint?.safeUrl ?? current.url ?? "";
    const entry = result.bySource.get(source);
    if (!entry) return;

    if (entry.status === "ready") {
      current.url = entry.path;
      current.data = {
        ...current.data,
        markdownMint: { ...current.data?.markdownMint, safeUrl: entry.path },
      };
      return;
    }

    current.url = "";
    current.data = {
      ...current.data,
      markdownMint: {
        ...current.data?.markdownMint,
        resourceError: entry.errorCode ?? "resource-failed",
      },
    };
    const diagnostic = diagnosticBySource.get(source);
    if (diagnostic) {
      addDiagnostic(context, {
        level: diagnostic.level,
        message: diagnostic.message.replace(source, "the referenced resource"),
        rule: diagnostic.rule,
        suggestion: diagnostic.suggestion,
        node: current,
      });
    }
  });

  for (const resource of context.resources) {
    if (resource.kind !== "image") continue;
    const entry = result.bySource.get(resource.url);
    if (entry?.status === "ready") resource.outputPath = entry.path;
  }
}

function setDirectiveData(node: MarkdownNode, data: MarkdownData): void {
  mergeData(node, data);
}

function normalizeDirective(node: MarkdownNode, context: CompileContext): void {
  const name = node.name?.toLowerCase() ?? "";
  const attributes = node.attributes ?? {};

  if (node.type === "textDirective") {
    if (name === "mark" || name === "kbd") {
      setDirectiveData(node, { hName: name });
      return;
    }

    if (name === "abbr") {
      const title = attributes.title?.trim();
      setDirectiveData(node, {
        hName: "abbr",
        ...(title ? { hProperties: { title } } : {}),
      });
      return;
    }

    addDiagnostic(context, {
      level: "warning",
      rule: "directive-name",
      message: `Inline directive \`${name || "(empty)"}\` is not supported and was rendered as plain text.`,
      suggestion: "Use `mark`, `kbd`, or `abbr` for inline directives.",
      node,
    });
    setDirectiveData(node, {
      hName: "span",
      hProperties: { className: ["mm-directive"] },
    });
    return;
  }

  if (name === "pagebreak" || name === "page-break") {
    setDirectiveData(node, {
      hName: "div",
      hProperties: {
        ariaLabel: context.metadata.language.toLowerCase().startsWith("zh") ? "分页" : "Page break",
        className: ["mm-page-break"],
        role: "separator",
      },
    });
    node.children = [];
    return;
  }

  if (CALLOUT_TYPES.has(name)) {
    const labels = CALLOUT_LABELS[name] ?? { en: name, zh: name };
    const label = context.metadata.language.toLowerCase().startsWith("zh") ? labels.zh : labels.en;
    const title = attributes.title?.trim() || label;
    const titleNode: MarkdownNode = {
      type: "paragraph",
      children: [{ type: "text", value: title }],
      data: { hProperties: { className: ["mm-callout__title"] } },
    };

    node.children = [titleNode, ...(node.children ?? [])];
    setDirectiveData(node, {
      hName: "aside",
      hProperties: {
        ariaLabel: title,
        className: ["mm-callout", `mm-callout--${name}`],
        role: "note",
      },
    });
    return;
  }

  addDiagnostic(context, {
    level: "warning",
    rule: "directive-name",
    message: `Block directive \`${name || "(empty)"}\` is not supported; its content was kept in a neutral container.`,
    suggestion: "Use warning, note, tip, info, caution, danger, important, or pagebreak.",
    node,
  });
  setDirectiveData(node, {
    hName: "div",
    hProperties: { className: ["mm-directive"] },
  });
}

async function normalizeTree(root: Root, context: CompileContext): Promise<void> {
  parseFrontmatter(root, context);

  visit(root, (node) => {
    const current = toMarkdownNode(node);

    if (current.type === "heading") {
      const text = normalizedText(textContent(current));
      if (!context.firstHeadingTitle && text) context.firstHeadingTitle = text;

      const level = Number.parseInt(
        String((current as MarkdownNode & { depth?: number }).depth),
        10,
      );
      const normalizedLevel = Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1;
      const baseId = normalizeHeadingId(text, context.headingIdPrefix);
      const duplicate = context.headingIds.has(baseId);
      const id = uniqueHeadingId(context, text);
      const heading: TocEntry = { children: [], id, level: normalizedLevel, text };

      if (!text) {
        addDiagnostic(context, {
          level: "warning",
          rule: "heading-text",
          message: "Heading has no text; a stable section ID was generated.",
          suggestion: "Add a short descriptive heading.",
          node: current,
        });
      }

      if (duplicate) {
        addDiagnostic(context, {
          level: "info",
          rule: "duplicate-heading",
          message: `Duplicate heading ID resolved as \`${id}\`.`,
          suggestion: "Use distinct heading text when stable deep links matter.",
          node: current,
        });
      }

      context.headings.push(heading);
      mergeData(current, { hProperties: { id } });
      return;
    }

    if (current.type === "image" && current.url) {
      const safeUrl = normalizeUrl(current.url, "image", context, current);
      current.data = {
        ...current.data,
        markdownMint: safeUrl ? { safeUrl } : {},
      };
      current.url = safeUrl ?? "";
      if (safeUrl) {
        const resource: CompiledResource = { kind: "image", url: safeUrl };
        if (current.alt) resource.alt = current.alt;
        if (current.title) resource.caption = current.title;
        const position = getPosition(current);
        if (position) resource.position = position;
        context.resources.push(resource);
      }
      return;
    }

    if ((current.type === "link" || current.type === "linkReference") && current.url) {
      const safeUrl = normalizeUrl(current.url, "link", context, current);
      current.data = {
        ...current.data,
        markdownMint: safeUrl ? { safeUrl } : {},
      };
      current.url = safeUrl ?? "";
      if (safeUrl && current.type === "link") {
        const resource: CompiledResource = { kind: "link", url: safeUrl };
        const position = getPosition(current);
        if (position) resource.position = position;
        context.resources.push(resource);
      }
      return;
    }

    if (current.type === "definition" && current.url) {
      const safeUrl = normalizeUrl(current.url, "link", context, current);
      current.url = safeUrl ?? "";
      return;
    }

    if (current.type === "code") {
      normalizeCode(current, context);
      return;
    }

    if (current.type === "html") {
      addDiagnostic(context, {
        level: "warning",
        rule: "html-not-allowed",
        message: "Raw HTML was removed from the compiled document.",
        suggestion: "Use Markdown or a supported directive instead of raw HTML.",
        node: current,
      });
      return;
    }

    if (
      current.type === "containerDirective" ||
      current.type === "leafDirective" ||
      current.type === "textDirective"
    ) {
      normalizeDirective(current, context);
    }
  });

  if (!context.metadata.title && context.firstHeadingTitle) {
    context.metadata.title = context.firstHeadingTitle;
  }

  await enrichCodeNodes(root, context);
  await applyResourceResolution(root, context);
}

function firstHastElement(root: HastRoot): Element | undefined {
  return root.children.find((child): child is Element => child.type === "element");
}

function addLanguageClass(element: Element, language: string): void {
  const code = element.children.find(
    (child): child is Element => child.type === "element" && child.tagName === "code",
  );
  if (!code) return;
  const current = code.properties.className;
  const classes = Array.isArray(current) ? current.map(String) : current ? [String(current)] : [];
  const languageClass = `language-${language}`;
  if (!classes.includes(languageClass)) classes.push(languageClass);
  code.properties.className = classes;
}

function createCodeHandler(state: State, rawNode: MarkdownNode): Element | ElementContent[] {
  const node = rawNode;
  const mermaidTree = node.data?.mermaid;
  if (mermaidTree) {
    const element = firstHastElement(mermaidTree);
    if (element) {
      if (node.lang) addLanguageClass(element, node.lang);
      state.patch(rawNode as never, element);
      return state.applyData(rawNode as never, element);
    }
  }

  if (node.data?.mermaidError) {
    const placeholder: Element = {
      children: [
        {
          type: "text",
          value: "Mermaid diagram unavailable. Check the diagram syntax and try again.",
        },
      ],
      properties: {
        ariaLabel: "Mermaid diagram unavailable",
        className: ["mm-mermaid-placeholder"],
        role: "img",
      },
      tagName: "div",
      type: "element",
    };
    state.patch(rawNode as never, placeholder);
    return state.applyData(rawNode as never, placeholder);
  }

  const highlighted = node.data?.highlighted;
  if (highlighted) {
    const element = firstHastElement(highlighted);
    if (element) {
      state.patch(rawNode as never, element);
      return state.applyData(rawNode as never, element);
    }
  }

  const properties: Properties = {};
  if (node.lang) properties.className = [`language-${node.lang}`];
  const code: Element = {
    children: [{ type: "text", value: node.value ? `${node.value}\n` : "" }],
    properties,
    tagName: "code",
    type: "element",
  };
  const pre: Element = {
    children: [code],
    properties: {},
    tagName: "pre",
    type: "element",
  };
  state.patch(rawNode as never, pre);
  return state.applyData(rawNode as never, pre);
}

const codeHandler: Handler = (state, rawNode) => createCodeHandler(state, toMarkdownNode(rawNode));

function createImageHandler(state: State, rawNode: Image): Element {
  const node = toMarkdownNode(rawNode);
  const safeUrl = node.data?.markdownMint?.safeUrl;

  if (node.data?.markdownMint?.resourceError) {
    const placeholder: Element = {
      children: [
        {
          type: "text",
          value: node.alt ? `Image unavailable: ${node.alt}` : "Image unavailable.",
        },
      ],
      properties: {
        ariaLabel: node.alt ? `Image unavailable: ${node.alt}` : "Image unavailable",
        className: ["mm-resource-placeholder"],
        role: "img",
      },
      tagName: "span",
      type: "element",
    };
    state.patch(rawNode, placeholder);
    return state.applyData(rawNode, placeholder);
  }

  const properties: Properties = {
    ...(node.alt !== null && node.alt !== undefined ? { alt: node.alt } : { alt: "" }),
    ...(safeUrl ? { src: safeUrl } : {}),
  };
  if (node.title) properties.title = node.title;

  const image: Element = {
    children: [],
    properties,
    tagName: "img",
    type: "element",
  };
  state.patch(rawNode, image);

  if (!node.title?.trim()) return state.applyData(rawNode, image);

  const caption: Element = {
    children: [{ type: "text", value: node.title.trim() }],
    properties: { className: ["mm-image-caption"] },
    tagName: "figcaption",
    type: "element",
  };
  const figure: Element = {
    children: [image, caption],
    properties: { className: ["mm-figure"] },
    tagName: "figure",
    type: "element",
  };
  state.patch(rawNode, figure);
  return state.applyData(rawNode, figure);
}

const imageHandler: Handler = (state, node) => createImageHandler(state, node as unknown as Image);

const linkHandler: Handler = (state, rawNode) => {
  const node = toMarkdownNode(rawNode);
  const properties: Properties = {};
  if (node.data?.markdownMint?.safeUrl) properties.href = node.data.markdownMint.safeUrl;
  if (node.title) properties.title = node.title;

  const result: Element = {
    children: state.all(rawNode),
    properties,
    tagName: "a",
    type: "element",
  };
  state.patch(rawNode, result);
  return state.applyData(rawNode, result);
};

function unwrapFigureParagraphs(root: HastTreeNode): void {
  if (!root.children) return;

  for (let index = 0; index < root.children.length; index += 1) {
    const child = root.children[index];
    if (!child) continue;
    if (
      child.type === "element" &&
      child.tagName === "p" &&
      child.children?.length === 1 &&
      child.children[0]?.type === "element" &&
      child.children[0].tagName === "figure"
    ) {
      root.children[index] = child.children[0];
      continue;
    }

    unwrapFigureParagraphs(child);
  }
}

function buildTocTree(entries: TocEntry[]): TocEntry[] {
  const roots: TocEntry[] = [];
  const stack: TocEntry[] = [];

  for (const entry of entries) {
    while (stack.length > 0 && stack.at(-1)!.level >= entry.level) stack.pop();
    if (stack.length === 0) roots.push(entry);
    else stack.at(-1)!.children.push(entry);
    stack.push(entry);
  }

  return roots;
}

function createContext(options: CompileOptions): CompileContext {
  const defaultLanguage = options.defaultLanguage ?? "zh-CN";
  return {
    defaultLanguage,
    diagnostics: [],
    headingIdPrefix: options.headingIdPrefix ?? "mm-",
    headingIds: new Set(),
    headings: [],
    metadata: { language: defaultLanguage },
    options,
    resourceManifest: { entries: [], totalBytes: 0 },
    resources: [],
  };
}

function documentFromContext(context: CompileContext, html: string): CompiledDocument {
  const messages = context.diagnostics.map((diagnostic) => diagnostic.message);
  return {
    compilerVersion: COMPILER_VERSION,
    diagnostics: context.diagnostics,
    html,
    messages,
    metadata: context.metadata,
    protocol: COMPILED_DOCUMENT_PROTOCOL,
    resourceManifest: context.resourceManifest,
    resources: context.resources,
    toc: buildTocTree(context.headings),
    version: COMPILED_DOCUMENT_VERSION,
  };
}

function errorDocument(context: CompileContext, error: unknown): CompiledDocument {
  const message =
    error instanceof Error ? error.message : "The Markdown document could not be compiled.";
  addDiagnostic(context, {
    level: "error",
    rule: "markdown-parse",
    message,
    suggestion: "Check the Markdown syntax near the reported location and try again.",
  });
  return documentFromContext(context, "");
}

function sourcePositionFromUnknown(value: unknown): SourcePosition | undefined {
  if (!value || typeof value !== "object" || !("start" in value) || !("end" in value)) {
    return undefined;
  }

  const start = value.start;
  const end = value.end;
  if (!start || typeof start !== "object" || !end || typeof end !== "object") return undefined;
  if (!("line" in start) || !("column" in start) || !("line" in end) || !("column" in end)) {
    return undefined;
  }

  const startLine = start.line;
  const startColumn = start.column;
  const endLine = end.line;
  const endColumn = end.column;
  if (
    typeof startLine !== "number" ||
    typeof startColumn !== "number" ||
    typeof endLine !== "number" ||
    typeof endColumn !== "number"
  ) {
    return undefined;
  }

  const startOffset =
    "offset" in start && typeof start.offset === "number" ? start.offset : undefined;
  const endOffset = "offset" in end && typeof end.offset === "number" ? end.offset : undefined;
  return {
    end: {
      column: endColumn,
      ...(endOffset === undefined ? {} : { offset: endOffset }),
      line: endLine,
    },
    start: {
      column: startColumn,
      ...(startOffset === undefined ? {} : { offset: startOffset }),
      line: startLine,
    },
  };
}

/**
 * Compile Markdown into the stable v1 semantic document protocol.
 *
 * Raw HTML is deliberately not passed through. URLs, IDs, directive output,
 * and generated HTML are sanitized before they become the public fragment.
 */
export async function compileMarkdown(
  markdown: string,
  options: CompileOptions = {},
): Promise<CompiledDocument> {
  const context = createContext(options);
  const source = markdown.replace(/\r\n?/gu, "\n");

  try {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkFrontmatter, ["yaml", "toml"])
      .use(remarkDirective);
    if (options.enableMath !== false) processor.use(remarkMath);

    processor
      .use(() => async (tree: Root) => normalizeTree(tree, context))
      .use(remarkRehype, {
        clobberPrefix: "mm-footnote-",
        footnoteBackLabel: context.metadata.language.toLowerCase().startsWith("zh")
          ? "返回脚注引用"
          : "Back to footnote reference",
        footnoteLabel: context.metadata.language.toLowerCase().startsWith("zh")
          ? "脚注"
          : "Footnotes",
        handlers: { code: codeHandler, image: imageHandler, link: linkHandler },
      });
    if (options.enableMath !== false) {
      processor.use(() => rehypeKatex({ strict: "warn", trust: false }));
    }
    processor
      .use(() => (tree: HastTreeNode) => unwrapFigureParagraphs(tree))
      .use(rehypeSanitize, sanitizeSchema)
      .use(rehypeStringify);

    const file = await processor.process({
      path: options.filename ?? "document.md",
      value: source,
    });

    for (const message of file.messages) {
      const position = sourcePositionFromUnknown(message.place);
      const diagnostic: Diagnostic = {
        level: "warning",
        message: message.message,
        rule: message.message.toLowerCase().includes("math") ? "math-render" : "markdown-parser",
        suggestion: message.message.toLowerCase().includes("math")
          ? "Check the KaTeX expression and supported commands."
          : "Review the Markdown syntax around this location.",
      };
      if (position) diagnostic.position = position;
      context.diagnostics.push(diagnostic);
    }

    return documentFromContext(context, String(file));
  } catch (error) {
    return errorDocument(context, error);
  }
}
