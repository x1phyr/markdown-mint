import { chromium, type Browser, type Page } from "playwright";
import { describe, expect, it, vi } from "vitest";

import type { CompiledDocument } from "@markdown-mint/compiler";
import type { ExportRequest, DocumentAsset } from "@markdown-mint/document-schema";

import type { PdfRenderInput } from "../src/jobs.js";
import {
  createChromiumPdfRenderer,
  createChromiumThumbnailRenderer,
  createPdfDocumentHtml,
  createPdfThumbnailCss,
  createPdfThumbnailHtml,
} from "../src/pdf-renderer.js";
import { PdfRendererError } from "../src/pdf-renderer.js";

const asset: DocumentAsset = {
  bytes: new Uint8Array([137, 80, 78, 71]),
  mediaType: "image/png",
  path: "images/logo.png",
};

const request: ExportRequest = {
  appearance: {
    accentColor: "#2f735f",
    codeTheme: "github-light",
    density: "normal",
    themeId: "technical-mint",
  },
  document: { author: "Test Author", language: "en", subtitle: "Subtitle", title: "Renderer" },
  features: { cover: true, footer: true, header: true, pageNumber: true, toc: true },
  output: { format: "pdf" },
  page: { margin: "normal", orientation: "portrait", size: "A4" },
  source: { assets: [asset], markdown: "# Renderer" },
};

const compiled: CompiledDocument = {
  compilerVersion: "0.1.0",
  diagnostics: [],
  html: '<h1 id="mm-renderer">Renderer</h1><img src="assets/asset-1234567890abcdef.png" alt="Logo">',
  messages: [],
  metadata: { author: "Compiled Author", language: "en", title: "Compiled title" },
  protocol: "markdown-mint/compiled-document",
  resourceManifest: {
    entries: [
      {
        bytes: asset.bytes.byteLength,
        id: "asset-1234567890abcdef",
        mediaType: "image/png",
        path: "assets/asset-1234567890abcdef.png",
        source: "./images/logo.png",
        sources: ["./images/logo.png"],
        status: "ready",
      },
    ],
    totalBytes: asset.bytes.byteLength,
  },
  resources: [],
  toc: [{ children: [], id: "mm-renderer", level: 1, text: "Renderer" }],
  version: 1,
};

function input(overrides: Partial<PdfRenderInput> = {}): PdfRenderInput {
  return {
    compiled,
    css: ".mm-document { color: #20211f; }",
    request,
    title: "Renderer",
    ...overrides,
  };
}

describe("Chromium PDF renderer", () => {
  it("creates a self-contained paged document with request page settings", () => {
    const html = createPdfDocumentHtml(input());

    expect(html).toContain("data:image/png;base64,iVBORw==");
    expect(html).not.toContain("assets/asset-1234567890abcdef.png");
    expect(html).toContain("size: A4 portrait");
    expect(html).toContain("margin: 18mm");
    expect(html).toContain("Compiled Author");
    expect(html).toContain(".mm-document > .mm-document-chrome--footer");

    const missingAssets = {
      ...compiled,
      metadata: { language: "en" },
      resourceManifest: {
        entries: [
          ...compiled.resourceManifest.entries,
          {
            bytes: 0,
            errorCode: "asset-missing",
            id: "failed-missing",
            mediaType: "application/octet-stream",
            path: "",
            reason: "missing",
            source: "./missing.png",
            sources: ["./missing.png"],
            status: "failed" as const,
          },
          {
            ...compiled.resourceManifest.entries[0]!,
            source: "./not-provided.png",
            sources: ["./not-provided.png"],
          },
        ],
        totalBytes: compiled.resourceManifest.totalBytes,
      },
    } satisfies CompiledDocument;
    const fallbackHtml = createPdfDocumentHtml(
      input({
        compiled: missingAssets,
        request: {
          ...request,
          document: { language: "en", title: "Renderer" },
        },
      }),
    );
    expect(fallbackHtml).not.toContain("not-provided.png");
  });

  it("pads thumbnail preview CSS to the selected page margin", () => {
    expect(createPdfThumbnailCss("18mm")).toContain("padding: 18mm");
    expect(createPdfThumbnailCss("12mm")).toContain("min-height: calc(100vh - (12mm * 2))");
    const html = createPdfThumbnailHtml(input());
    expect(html).toContain("data-mm-thumbnail-padding");
    expect(html).toContain("padding: 18mm");
    expect(html.indexOf("data-mm-thumbnail-padding")).toBeLessThan(html.indexOf("</head>"));
  });

  it("renders through an isolated browser context and reports page count", async () => {
    const routeDecisions: string[] = [];
    const page = {
      emulateMedia: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7\n/Type /Page\n%%EOF")),
      route: vi.fn(async (_pattern: string, handler: (route: unknown) => Promise<void>) => {
        const makeRoute = (url: string) => ({
          abort: async () => routeDecisions.push(`abort:${url}`),
          continue: async () => routeDecisions.push(`continue:${url}`),
          request: () => ({ url: () => url }),
        });
        await handler(makeRoute("data:text/plain,ok"));
        await handler(makeRoute("https://unexpected.example/blocked"));
      }),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("thumbnail")),
      setContent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;
    const context = {
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(page),
    };
    const browser = {
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn().mockResolvedValue(context),
    } as unknown as Browser;
    const renderer = createChromiumPdfRenderer({ browserFactory: async () => browser });

    const result = await renderer(input());

    expect(result.pageCount).toBe(1);
    expect(result.bytes.byteLength).toBeGreaterThan(0);
    expect(result.thumbnail).toEqual(new Uint8Array(Buffer.from("thumbnail")));
    expect(page.setContent).toHaveBeenCalledTimes(2);
    expect(page.setContent.mock.calls[1]?.[0]).toContain("data-mm-thumbnail-padding");
    expect(page.screenshot).toHaveBeenCalledWith({
      animations: "disabled",
      fullPage: false,
      type: "png",
    });
    expect(browser.newContext).toHaveBeenCalledWith({
      javaScriptEnabled: false,
      serviceWorkers: "block",
      viewport: { height: 1123, width: 794 },
    });
    expect(page.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "A4",
        landscape: false,
        displayHeaderFooter: true,
        headerTemplate: expect.stringContaining("Renderer"),
        footerTemplate: expect.stringContaining("pageNumber"),
        margin: { bottom: "18mm", left: "18mm", right: "18mm", top: "18mm" },
        preferCSSPageSize: true,
        printBackground: true,
      }),
    );
    const pdfOptions = page.pdf.mock.calls[0]?.[0] as {
      footerTemplate: string;
      headerTemplate: string;
    };
    expect(pdfOptions.headerTemplate).toContain("padding:0 18mm");
    expect(pdfOptions.headerTemplate).toContain("height:18mm");
    expect(pdfOptions.footerTemplate).toContain("padding:0 18mm");
    expect(pdfOptions.footerTemplate).toContain("height:18mm");
    expect(routeDecisions).toEqual([
      "continue:data:text/plain,ok",
      "abort:https://unexpected.example/blocked",
    ]);
    expect(context.close).toHaveBeenCalledOnce();

    await renderer.close?.();
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("supports an author-only footer and omits PDF chrome when all chrome is disabled", async () => {
    const page = {
      emulateMedia: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7\n/Type /Page\n%%EOF")),
      route: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("thumbnail")),
      setContent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;
    const context = {
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(page),
    };
    const browser = {
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn().mockResolvedValue(context),
    } as unknown as Browser;
    const renderer = createChromiumPdfRenderer({ browserFactory: async () => browser });

    await renderer(
      input({
        request: {
          ...request,
          features: { ...request.features, header: false, pageNumber: false },
        },
      }),
    );
    const authorOnlyOptions = page.pdf.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(authorOnlyOptions.footerTemplate).toEqual(expect.stringContaining("Compiled Author"));
    expect(authorOnlyOptions.footerTemplate).not.toEqual(expect.stringContaining("pageNumber"));

    await renderer(
      input({
        compiled: { ...compiled, metadata: { language: "en", title: "No chrome" } },
        request: {
          ...request,
          document: { language: "en", title: "No chrome" },
          features: { cover: false, footer: false, header: false, pageNumber: false, toc: false },
        },
      }),
    );
    const noChromeOptions = page.pdf.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(noChromeOptions).not.toHaveProperty("displayHeaderFooter");
    expect(noChromeOptions).not.toHaveProperty("headerTemplate");
    expect(noChromeOptions).not.toHaveProperty("footerTemplate");
    await renderer.close?.();
  });

  it("keeps a valid PDF when the progressive thumbnail capture fails", async () => {
    const page = {
      emulateMedia: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7\n/Type /Page\n%%EOF")),
      route: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockRejectedValue(new Error("preview failed")),
      setContent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;
    const context = {
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(page),
    };
    const browser = {
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn().mockResolvedValue(context),
    } as unknown as Browser;
    const renderer = createChromiumPdfRenderer({ browserFactory: async () => browser });

    await expect(renderer(input())).resolves.toMatchObject({ pageCount: 1 });
    await renderer.close?.();
  });

  it("returns stable errors for unavailable and invalid backends", async () => {
    const unavailable = createChromiumPdfRenderer({
      browserFactory: async () => {
        throw new Error("browser missing");
      },
    });
    await expect(unavailable(input())).rejects.toMatchObject<PdfRendererError>({
      code: "pdf-backend-unavailable",
    });

    const invalidPage = {
      emulateMedia: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn().mockResolvedValue(new Uint8Array()),
      route: vi.fn().mockResolvedValue(undefined),
      setContent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;
    const invalidContext = {
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(invalidPage),
    };
    const invalidBrowser = {
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn().mockResolvedValue(invalidContext),
    } as unknown as Browser;
    const invalid = createChromiumPdfRenderer({ browserFactory: async () => invalidBrowser });

    await expect(invalid(input())).rejects.toMatchObject<PdfRendererError>({
      code: "pdf-renderer-invalid",
    });
    expect(invalidContext.close).toHaveBeenCalledOnce();
    await invalid.close?.();
  });

  it("uses the configured Playwright launch settings and preserves renderer errors", async () => {
    const previousNoSandbox = process.env.PLAYWRIGHT_NO_SANDBOX;
    process.env.PLAYWRIGHT_NO_SANDBOX = "1";
    const launch = vi.spyOn(chromium, "launch").mockRejectedValue(new Error("browser missing"));
    const renderer = createChromiumPdfRenderer({
      executablePath: "/opt/chromium/chrome",
      launchArgs: ["--test-flag"],
    });

    try {
      await expect(renderer(input())).rejects.toMatchObject<PdfRendererError>({
        code: "pdf-backend-unavailable",
      });
      expect(launch).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining([
            "--disable-dev-shm-usage",
            "--disable-background-networking",
            "--no-sandbox",
            "--test-flag",
          ]),
          executablePath: "/opt/chromium/chrome",
          headless: true,
        }),
      );
      await renderer.close?.();
    } finally {
      launch.mockRestore();
      if (previousNoSandbox === undefined) delete process.env.PLAYWRIGHT_NO_SANDBOX;
      else process.env.PLAYWRIGHT_NO_SANDBOX = previousNoSandbox;
    }

    await createChromiumPdfRenderer().close?.();
  });

  it("reports generic render failures and tolerates a closing browser context", async () => {
    const page = {
      emulateMedia: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn().mockRejectedValue(new Error("print failed")),
      route: vi.fn().mockResolvedValue(undefined),
      setContent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;
    const context = {
      close: vi.fn().mockRejectedValue(new Error("already closed")),
      newPage: vi.fn().mockResolvedValue(page),
    };
    const browser = {
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn().mockResolvedValue(context),
    } as unknown as Browser;
    const renderer = createChromiumPdfRenderer({ browserFactory: async () => browser });

    await expect(renderer(input())).rejects.toMatchObject<PdfRendererError>({
      code: "pdf-renderer-failed",
    });
    await renderer.close?.();

    const nonErrorPage = {
      emulateMedia: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn().mockRejectedValue("print failed"),
      route: vi.fn().mockResolvedValue(undefined),
      setContent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;
    const nonErrorContext = {
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(nonErrorPage),
    };
    const nonErrorBrowser = {
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn().mockResolvedValue(nonErrorContext),
    } as unknown as Browser;
    const nonErrorRenderer = createChromiumPdfRenderer({
      browserFactory: async () => nonErrorBrowser,
    });
    await expect(nonErrorRenderer(input())).rejects.toMatchObject<PdfRendererError>({
      code: "pdf-renderer-failed",
      message: expect.stringContaining("Unknown PDF rendering error"),
    });
    await nonErrorRenderer.close?.();
  });

  it("rejects a non-empty PDF that does not contain a page", async () => {
    const page = {
      emulateMedia: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7")),
      route: vi.fn().mockResolvedValue(undefined),
      setContent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;
    const context = {
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(page),
    };
    const browser = {
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn().mockResolvedValue(context),
    } as unknown as Browser;
    const renderer = createChromiumPdfRenderer({ browserFactory: async () => browser });

    await expect(renderer(input())).rejects.toMatchObject<PdfRendererError>({
      code: "pdf-renderer-invalid",
    });
    await renderer.close?.();
  });

  it("captures an isolated Chromium thumbnail for an external PDF backend", async () => {
    const routeDecisions: string[] = [];
    const page = {
      emulateMedia: vi.fn().mockResolvedValue(undefined),
      route: vi.fn(async (_pattern: string, handler: (route: unknown) => Promise<void>) => {
        const makeRoute = (url: string) => ({
          abort: async () => routeDecisions.push(`abort:${url}`),
          continue: async () => routeDecisions.push(`continue:${url}`),
          request: () => ({ url: () => url }),
        });
        await handler(makeRoute("blob:preview"));
        await handler(makeRoute("https://unexpected.example/blocked"));
      }),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("thumbnail")),
      setContent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;
    const context = {
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(page),
    };
    const browser = {
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn().mockResolvedValue(context),
    } as unknown as Browser;
    const renderer = createChromiumThumbnailRenderer({ browserFactory: async () => browser });

    await expect(renderer(input())).resolves.toEqual(new Uint8Array(Buffer.from("thumbnail")));
    expect(page.setContent.mock.calls[0]?.[0]).toContain("data-mm-thumbnail-padding");
    expect(routeDecisions).toEqual([
      "continue:blob:preview",
      "abort:https://unexpected.example/blocked",
    ]);
    expect(context.close).toHaveBeenCalledOnce();
    await renderer.close?.();
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("fails closed when the thumbnail browser cannot start and tolerates an empty screenshot", async () => {
    const untouched = createChromiumThumbnailRenderer({
      browserFactory: async () => {
        throw new Error("should not launch");
      },
    });
    await untouched.close?.();

    const unavailable = createChromiumThumbnailRenderer({
      browserFactory: async () => {
        throw new Error("thumbnail browser missing");
      },
    });
    await expect(unavailable(input())).rejects.toMatchObject({
      code: "pdf-backend-unavailable",
    });
    await unavailable.close?.();

    const typedUnavailable = createChromiumThumbnailRenderer({
      browserFactory: async () => {
        throw new PdfRendererError("pdf-backend-unavailable", "typed failure");
      },
    });
    await expect(typedUnavailable(input())).rejects.toMatchObject({
      code: "pdf-backend-unavailable",
    });
    await typedUnavailable.close?.();

    const page = {
      emulateMedia: vi.fn().mockResolvedValue(undefined),
      route: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(new Uint8Array()),
      setContent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;
    const context = {
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(page),
    };
    const browser = {
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn().mockResolvedValue(context),
    } as unknown as Browser;
    const empty = createChromiumThumbnailRenderer({ browserFactory: async () => browser });
    await expect(empty(input())).resolves.toBeUndefined();
    await empty.close?.();
  });
});
