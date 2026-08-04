import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PdfRenderInput } from "./jobs.js";
import {
  countPdfPages,
  createChromiumThumbnailRenderer,
  createVivliostyleDocumentHtml,
  PdfRendererError,
  type PdfRenderResult,
  type PdfRenderer,
  type ThumbnailRenderer,
} from "./pdf-renderer.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_COMMAND_OUTPUT_BYTES = 16 * 1024;

export interface VivliostyleCommandResult {
  exitCode: number | null;
  stderr: string;
  stdout: string;
}

export type VivliostyleCommandRunner = (
  binaryPath: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
) => Promise<VivliostyleCommandResult>;

export interface VivliostylePdfRendererOptions {
  binaryPath?: string;
  browserExecutablePath?: string;
  commandRunner?: VivliostyleCommandRunner;
  thumbnailRenderer?: ThumbnailRenderer;
  timeoutMs?: number;
  workspaceRoot?: string;
}

function appendBounded(current: string, chunk: Buffer): string {
  const remaining = MAX_COMMAND_OUTPUT_BYTES - Buffer.byteLength(current, "utf8");
  if (remaining <= 0) return current;
  return current + chunk.toString("utf8").slice(0, remaining);
}

const runCommand: VivliostyleCommandRunner = (binaryPath, args, cwd, timeoutMs) =>
  new Promise((resolve, reject) => {
    const child = spawn(binaryPath, [...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      const error = Object.assign(new Error("Vivliostyle CLI timed out."), { code: "ETIMEDOUT" });
      reject(error);
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stderr, stdout });
    });
  });

function timeoutFromEnvironment(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function commandErrorMessage(result: VivliostyleCommandResult): string {
  const detail = result.stderr.trim() || result.stdout.trim();
  return detail
    ? `Vivliostyle CLI exited with code ${String(result.exitCode)}: ${detail}`
    : `Vivliostyle CLI exited with code ${String(result.exitCode)}.`;
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function renderArgs(
  input: PdfRenderInput,
  inputPath: string,
  outputPath: string,
  timeoutMs: number,
  browserExecutablePath?: string,
) {
  const size = input.request.page.size === "Letter" ? "letter" : "A4";
  return [
    "build",
    "--single-doc",
    "--no-enable-static-serve",
    "--log-level",
    "silent",
    "--timeout",
    String(Math.max(1, Math.ceil(timeoutMs / 1000))),
    "--size",
    size,
    ...(process.env.VIVLIOSTYLE_BROWSER ? ["--browser", process.env.VIVLIOSTYLE_BROWSER] : []),
    ...(browserExecutablePath ? ["--executable-browser", browserExecutablePath] : []),
    "--output",
    outputPath,
    inputPath,
  ];
}

export function createVivliostylePdfRenderer(
  options: VivliostylePdfRendererOptions = {},
): PdfRenderer {
  const binaryPath = options.binaryPath ?? process.env.VIVLIOSTYLE_BIN ?? "vivliostyle";
  const timeoutMs = options.timeoutMs ?? timeoutFromEnvironment(process.env.VIVLIOSTYLE_TIMEOUT_MS);
  const commandRunner = options.commandRunner ?? runCommand;
  const workspaceRoot = options.workspaceRoot ?? tmpdir();
  const thumbnailRenderer =
    options.thumbnailRenderer ??
    createChromiumThumbnailRenderer({
      ...(options.browserExecutablePath ? { executablePath: options.browserExecutablePath } : {}),
    });

  const renderer: PdfRenderer = async (input): Promise<PdfRenderResult> => {
    let workspace: string | undefined;
    try {
      if (input.signal?.aborted) {
        const error = new Error("Vivliostyle PDF rendering was aborted.");
        error.name = "AbortError";
        throw error;
      }
      workspace = await mkdtemp(
        join(input.workspaceDir ?? workspaceRoot, "markdown-mint-vivliostyle-"),
      );
      const inputPath = join(workspace, "document.html");
      const outputPath = join(workspace, "document.pdf");
      await writeFile(inputPath, createVivliostyleDocumentHtml(input), "utf8");

      let commandResult: VivliostyleCommandResult;
      try {
        commandResult = await commandRunner(
          binaryPath,
          renderArgs(
            input,
            inputPath,
            outputPath,
            timeoutMs,
            options.browserExecutablePath ?? process.env.VIVLIOSTYLE_BROWSER_EXECUTABLE,
          ),
          workspace,
          timeoutMs,
        );
      } catch (error) {
        if (input.signal?.aborted) {
          const abortError = new Error("Vivliostyle PDF rendering was aborted.");
          abortError.name = "AbortError";
          throw abortError;
        }
        const code = errorCode(error);
        if (code === "ENOENT") {
          throw new PdfRendererError(
            "pdf-backend-unavailable",
            `The Vivliostyle CLI backend is unavailable. Install the audited CLI and set VIVLIOSTYLE_BIN. ${binaryPath} was not found.`,
          );
        }
        if (code === "ETIMEDOUT") {
          throw new PdfRendererError(
            "pdf-renderer-failed",
            `Vivliostyle PDF rendering exceeded the ${timeoutMs}ms timeout.`,
          );
        }
        const reason = error instanceof Error ? error.message : "Unknown CLI process error.";
        throw new PdfRendererError(
          "pdf-renderer-failed",
          `Vivliostyle PDF rendering failed. ${reason}`,
        );
      }

      if (commandResult.exitCode !== 0) {
        throw new PdfRendererError("pdf-renderer-failed", commandErrorMessage(commandResult));
      }

      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await readFile(outputPath));
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Output PDF was not created.";
        throw new PdfRendererError(
          "pdf-renderer-invalid",
          `Vivliostyle CLI completed without a readable PDF artifact. ${reason}`,
        );
      }
      const pageCount = countPdfPages(bytes);
      if (bytes.byteLength === 0 || pageCount < 1) {
        throw new PdfRendererError(
          "pdf-renderer-invalid",
          "The Vivliostyle CLI returned an invalid or empty PDF artifact.",
        );
      }

      let thumbnail: Uint8Array | undefined;
      try {
        thumbnail = await thumbnailRenderer(input);
      } catch {
        // The preview is progressive enhancement; a valid PDF must remain downloadable.
      }
      return {
        bytes,
        pageCount,
        ...(thumbnail && thumbnail.byteLength > 0 ? { thumbnail } : {}),
      };
    } catch (error) {
      if (
        (error instanceof Error && error.name === "AbortError") ||
        (typeof DOMException !== "undefined" &&
          error instanceof DOMException &&
          error.name === "AbortError")
      ) {
        throw error;
      }
      if (error instanceof PdfRendererError) throw error;
      const reason = error instanceof Error ? error.message : "Unknown Vivliostyle error.";
      throw new PdfRendererError(
        "pdf-renderer-failed",
        `Vivliostyle PDF rendering failed. ${reason}`,
      );
    } finally {
      if (workspace) await rm(workspace, { force: true, recursive: true }).catch(() => undefined);
    }
  };

  renderer.close = async () => {
    await thumbnailRenderer.close?.();
  };

  return renderer;
}
