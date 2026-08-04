import { chromium, type Browser, type BrowserContext } from "playwright";

import { createDocumentBodyHtml, createStandaloneHtml } from "@markdown-mint/html-exporter";
import type { DocumentAsset } from "@markdown-mint/document-schema";
import type { PdfRenderInput } from "./jobs.js";

export interface PdfRenderResult {
  bytes: Uint8Array;
  pageCount: number;
  thumbnail?: Uint8Array;
}

export interface ChromiumPdfRendererOptions {
  browserFactory?: () => Promise<Browser>;
  executablePath?: string;
  launchArgs?: readonly string[];
}

export type PdfRenderer = ((input: PdfRenderInput) => Promise<PdfRenderResult>) & {
  close?: () => Promise<void>;
};

export type ThumbnailRenderer = ((input: PdfRenderInput) => Promise<Uint8Array | undefined>) & {
  close?: () => Promise<void>;
};

export class PdfRendererError extends Error {
  constructor(
    public readonly code:
      "pdf-backend-unavailable" | "pdf-renderer-failed" | "pdf-renderer-invalid",
    message: string,
  ) {
    super(message);
    this.name = "PdfRendererError";
  }
}

const PAGE_MARGINS = {
  compact: "12mm",
  normal: "18mm",
  relaxed: "26mm",
} as const;

const EMPTY_PAGE_TEMPLATE = "<span></span>";

function normalizedAssetPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function assetForEntry(
  entrySource: string,
  sources: readonly string[],
  assets: readonly DocumentAsset[],
) {
  const candidates = [entrySource, ...sources].map(normalizedAssetPath);
  return assets.find((asset) => candidates.includes(normalizedAssetPath(asset.path)));
}

export function inlineResourceReferences(
  html: string,
  compiled: PdfRenderInput["compiled"],
  assets: readonly DocumentAsset[],
): string {
  let result = html;
  for (const entry of compiled.resourceManifest.entries) {
    if (entry.status !== "ready" || !entry.path) continue;
    const asset = assetForEntry(entry.source, entry.sources, assets);
    if (!asset) continue;
    const dataUri = `data:${entry.mediaType};base64,${Buffer.from(asset.bytes).toString("base64")}`;
    const reference = new RegExp(`(\\bsrc\\s*=\\s*["'])${escapeRegExp(entry.path)}(["'])`, "gu");
    result = result.replace(reference, `$1${dataUri}$2`);
  }
  return result;
}

export function createPdfPageCss(input: PdfRenderInput): string {
  const size = input.request.page.size;
  const orientation = input.request.page.orientation;
  const margin = PAGE_MARGINS[input.request.page.margin];
  return `${input.css}
@page {
  size: ${size} ${orientation};
  margin: ${margin};
}
html, body {
  margin: 0;
  padding: 0;
}
@media print {
  .mm-document > .mm-document-chrome--header,
  .mm-document > .mm-document-chrome--footer {
    display: none;
  }
}`;
}

function cssString(value: string): string {
  return JSON.stringify(value)
    .replace(/\u2028/gu, "\\u2028")
    .replace(/\u2029/gu, "\\u2029");
}

/**
 * Adds CSS paged-media margin boxes for an external Vivliostyle CLI process.
 * Chromium's headerTemplate/footerTemplate API remains the default renderer;
 * this stylesheet is kept separate so the two pagination contracts can be
 * compared without bundling the AGPL CLI into the Apache-2.0 application.
 */
export function createVivliostylePageCss(input: PdfRenderInput): string {
  const author = input.compiled.metadata.author ?? input.request.document.author ?? "";
  const showHeader = input.request.features.header;
  const showFooter = input.request.features.footer || input.request.features.pageNumber;
  const margin = PAGE_MARGINS[input.request.page.margin];
  const size = input.request.page.size;
  const orientation = input.request.page.orientation;
  const textStyle = "color:#6b7169;font-family:'Liberation Sans',Arial,sans-serif;font-size:8pt;";
  const header = showHeader
    ? `@top-center { content: ${cssString(input.title)}; ${textStyle} }`
    : "";
  const footerLeft =
    showFooter && author ? `@bottom-left { content: ${cssString(author)}; ${textStyle} }` : "";
  const footerRight = input.request.features.pageNumber
    ? `@bottom-right { content: "Page " counter(page) " / " counter(pages); ${textStyle} }`
    : "";

  return `${createPdfPageCss(input)}
@page {
  size: ${size} ${orientation};
  margin: ${margin};
  ${header}
  ${footerLeft}
  ${footerRight}
}
@media print {
  .mm-document > .mm-document-chrome--header,
  .mm-document > .mm-document-chrome--footer {
    display: none;
  }
}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pageTemplate(left: string, right: string): string {
  return `<div style="align-items:center;color:#6b7169;display:flex;font-family:'Liberation Sans',Arial,sans-serif;font-size:8px;justify-content:space-between;width:100%;">${left}<span>${right}</span></div>`;
}

function pdfHeaderTemplate(input: PdfRenderInput): string {
  return pageTemplate(escapeHtml(input.title), "");
}

function pdfFooterTemplate(input: PdfRenderInput): string {
  const author = input.compiled.metadata.author ?? input.request.document.author ?? "";
  const left = author ? escapeHtml(author) : "";
  const right = input.request.features.pageNumber
    ? '<span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>'
    : "";
  return pageTemplate(left, right);
}

export function createPdfDocumentHtml(input: PdfRenderInput): string {
  const author = input.compiled.metadata.author ?? input.request.document.author;
  const subtitle = input.compiled.metadata.subtitle ?? input.request.document.subtitle;
  const bodyHtml = createDocumentBodyHtml({
    bodyHtml: input.compiled.html,
    features: input.request.features,
    headerText: input.title,
    title: input.title,
    toc: input.compiled.toc,
    ...(author ? { author, footerText: author } : {}),
    ...(subtitle ? { subtitle } : {}),
  });

  return createStandaloneHtml({
    bodyHtml: inlineResourceReferences(bodyHtml, input.compiled, input.request.source.assets),
    css: createPdfPageCss(input),
    language: input.compiled.metadata.language,
    title: input.title,
  });
}

export function createVivliostyleDocumentHtml(input: PdfRenderInput): string {
  const author = input.compiled.metadata.author ?? input.request.document.author;
  const subtitle = input.compiled.metadata.subtitle ?? input.request.document.subtitle;
  const bodyHtml = createDocumentBodyHtml({
    bodyHtml: input.compiled.html,
    features: input.request.features,
    headerText: input.title,
    title: input.title,
    toc: input.compiled.toc,
    ...(author ? { author, footerText: author } : {}),
    ...(subtitle ? { subtitle } : {}),
  });

  return createStandaloneHtml({
    bodyHtml: inlineResourceReferences(bodyHtml, input.compiled, input.request.source.assets),
    css: createVivliostylePageCss(input),
    language: input.compiled.metadata.language,
    title: input.title,
  });
}

export function countPdfPages(bytes: Uint8Array): number {
  const source = Buffer.from(bytes).toString("latin1");
  return [...source.matchAll(/\/Type\s*\/Page\b/gu)].length;
}

async function launchChromium(options: ChromiumPdfRendererOptions): Promise<Browser> {
  try {
    const executablePath =
      options.executablePath ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    return await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      args: [
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        ...(process.env.PLAYWRIGHT_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
        ...(options.launchArgs ?? []),
      ],
      headless: true,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Chromium could not be started.";
    throw new PdfRendererError(
      "pdf-backend-unavailable",
      `The Chromium PDF backend is unavailable. Install the pinned browser runtime or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. ${reason}`,
    );
  }
}

async function closeContext(context: BrowserContext | undefined): Promise<void> {
  if (!context) return;
  try {
    await context.close();
  } catch {
    // The browser may already be shutting down; the rendered artifact is still valid.
  }
}

export function createChromiumPdfRenderer(options: ChromiumPdfRendererOptions = {}): PdfRenderer {
  let browserPromise: Promise<Browser> | undefined;

  const getBrowser = (): Promise<Browser> => {
    browserPromise ??= (async () => {
      try {
        return await (options.browserFactory?.() ?? launchChromium(options));
      } catch (error) {
        if (error instanceof PdfRendererError) throw error;
        const reason = error instanceof Error ? error.message : "Chromium could not be started.";
        throw new PdfRendererError(
          "pdf-backend-unavailable",
          `The Chromium PDF backend is unavailable. ${reason}`,
        );
      }
    })();
    return browserPromise;
  };

  const renderer: PdfRenderer = async (input) => {
    let context: BrowserContext | undefined;
    const onAbort = (): void => {
      void closeContext(context);
    };
    input.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      throwIfAborted(input.signal);
      const browser = await getBrowser();
      throwIfAborted(input.signal);
      context = await browser.newContext({
        javaScriptEnabled: false,
        serviceWorkers: "block",
        viewport: { height: 1123, width: 794 },
      });
      const page = await context.newPage();
      await page.route("**/*", async (route) => {
        const url = route.request().url();
        if (url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:")) {
          await route.continue();
        } else {
          await route.abort("blockedbyclient");
        }
      });
      await page.setContent(createPdfDocumentHtml(input), { waitUntil: "load" });
      await page.emulateMedia({ media: "print" });
      throwIfAborted(input.signal);
      const showHeader = input.request.features.header;
      const showFooter =
        input.request.features.pageNumber ||
        (input.request.features.footer &&
          Boolean(input.compiled.metadata.author ?? input.request.document.author));
      const pdf = await page.pdf({
        ...(showHeader || showFooter ? { displayHeaderFooter: true } : {}),
        ...(showHeader ? { headerTemplate: pdfHeaderTemplate(input) } : {}),
        ...(showHeader || showFooter
          ? { footerTemplate: showFooter ? pdfFooterTemplate(input) : EMPTY_PAGE_TEMPLATE }
          : {}),
        format: input.request.page.size,
        landscape: input.request.page.orientation === "landscape",
        margin: {
          bottom: PAGE_MARGINS[input.request.page.margin],
          left: PAGE_MARGINS[input.request.page.margin],
          right: PAGE_MARGINS[input.request.page.margin],
          top: PAGE_MARGINS[input.request.page.margin],
        },
        preferCSSPageSize: true,
        printBackground: true,
      });
      throwIfAborted(input.signal);
      const bytes = new Uint8Array(pdf);
      const pageCount = countPdfPages(bytes);
      if (bytes.byteLength === 0 || pageCount < 1) {
        throw new PdfRendererError(
          "pdf-renderer-invalid",
          "The Chromium PDF backend returned an invalid or empty PDF artifact.",
        );
      }
      try {
        const thumbnail = new Uint8Array(
          await page.screenshot({ animations: "disabled", fullPage: false, type: "png" }),
        );
        if (thumbnail.byteLength > 0) return { bytes, pageCount, thumbnail };
      } catch (error) {
        if (isAbortError(error) || input.signal?.aborted) throwIfAborted(input.signal);
        // The preview is progressive enhancement; a valid PDF must remain downloadable.
      }
      return { bytes, pageCount };
    } catch (error) {
      if (isAbortError(error) || input.signal?.aborted) throwIfAborted(input.signal);
      if (error instanceof PdfRendererError) throw error;
      const reason = error instanceof Error ? error.message : "Unknown PDF rendering error.";
      throw new PdfRendererError("pdf-renderer-failed", `Chromium PDF rendering failed. ${reason}`);
    } finally {
      input.signal?.removeEventListener("abort", onAbort);
      await closeContext(context);
    }
  };

  renderer.close = async () => {
    if (!browserPromise) return;
    const browser = await browserPromise.catch(() => undefined);
    browserPromise = undefined;
    if (browser) await browser.close();
  };

  return renderer;
}

/**
 * Captures the same isolated print document used by Chromium PDF rendering.
 * It is also used as progressive enhancement for external PDF backends so a
 * backend swap does not silently remove the result-page preview.
 */
export function createChromiumThumbnailRenderer(
  options: ChromiumPdfRendererOptions = {},
): ThumbnailRenderer {
  let browserPromise: Promise<Browser> | undefined;

  const getBrowser = (): Promise<Browser> => {
    browserPromise ??= (async () => {
      try {
        return await (options.browserFactory?.() ?? launchChromium(options));
      } catch (error) {
        if (error instanceof PdfRendererError) throw error;
        const reason = error instanceof Error ? error.message : "Chromium could not be started.";
        throw new PdfRendererError(
          "pdf-backend-unavailable",
          `The Chromium thumbnail backend is unavailable. ${reason}`,
        );
      }
    })();
    return browserPromise;
  };

  const renderer: ThumbnailRenderer = async (input) => {
    let context: BrowserContext | undefined;
    try {
      const browser = await getBrowser();
      context = await browser.newContext({
        javaScriptEnabled: false,
        serviceWorkers: "block",
        viewport: { height: 1123, width: 794 },
      });
      const page = await context.newPage();
      await page.route("**/*", async (route) => {
        const url = route.request().url();
        if (url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:")) {
          await route.continue();
        } else {
          await route.abort("blockedbyclient");
        }
      });
      await page.setContent(createPdfDocumentHtml(input), { waitUntil: "load" });
      await page.emulateMedia({ media: "print" });
      const bytes = new Uint8Array(
        await page.screenshot({ animations: "disabled", fullPage: false, type: "png" }),
      );
      return bytes.byteLength > 0 ? bytes : undefined;
    } finally {
      await closeContext(context);
    }
  };

  renderer.close = async () => {
    if (!browserPromise) return;
    const browser = await browserPromise.catch(() => undefined);
    browserPromise = undefined;
    if (browser) await browser.close();
  };

  return renderer;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error("PDF rendering was aborted.");
  error.name = "AbortError";
  throw error;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError")
  );
}
