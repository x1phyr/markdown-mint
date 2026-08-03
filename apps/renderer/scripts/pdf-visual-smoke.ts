import { createHash } from "node:crypto";
import { readdir, readFile, rm, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

interface VisualBaselinePage {
  file: string;
  sha256: string;
}

interface VisualBaseline {
  dpi: number;
  pageCount: number;
  pageSize: string;
  pages: VisualBaselinePage[];
  renderer: string;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const inputPath = resolve(
  repoRoot,
  process.env.PDF_VISUAL_INPUT ?? "tmp/pdfs/renderer-pdf-smoke.pdf",
);
const baselinePath = resolve(
  repoRoot,
  process.env.PDF_VISUAL_BASELINE ?? "fixtures/p8-pdf-visual-baseline.json",
);
const outputDirectory = resolve(
  repoRoot,
  process.env.PDF_VISUAL_OUTPUT_DIR ?? "tmp/pdfs/renderer-pdf-visual",
);
const dpi = Number.parseInt(process.env.PDF_VISUAL_DPI ?? "144", 10);

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(stdout);
        return;
      }
      reject(new Error(`${command} exited with ${code}. ${stderr.trim()}`));
    });
  });
}

function parsePdfInfo(output: string): { pageCount: number; pageSize: string } {
  const pageCount = Number.parseInt(output.match(/^Pages:\s+(\d+)$/mu)?.[1] ?? "", 10);
  const pageSize = output.match(/^Page size:\s+(.+)$/mu)?.[1]?.trim() ?? "";
  if (!Number.isFinite(pageCount) || !pageSize) {
    throw new Error("pdfinfo did not return a page count and page size.");
  }
  return { pageCount, pageSize };
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function main(): Promise<void> {
  if (!Number.isFinite(dpi) || dpi < 72) throw new Error("PDF_VISUAL_DPI must be at least 72.");

  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as VisualBaseline;
  const pdfInfo = parsePdfInfo(await run(process.env.PDFINFO_PATH ?? "pdfinfo", [inputPath]));
  await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  await run(process.env.PDFTOPPM_PATH ?? "pdftoppm", [
    "-r",
    String(dpi),
    "-png",
    inputPath,
    join(outputDirectory, "page"),
  ]);

  const renderedFiles = (await readdir(outputDirectory))
    .filter((file) => /^page-\d+\.png$/u.test(file))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const renderedPages = await Promise.all(
    renderedFiles.map(async (file) => ({
      file,
      sha256: await sha256(join(outputDirectory, file)),
    })),
  );
  const failures: string[] = [];
  if (baseline.renderer !== "playwright-chromium") {
    failures.push(`baseline renderer is ${baseline.renderer}, expected playwright-chromium`);
  }
  if (baseline.dpi !== dpi) failures.push(`DPI is ${dpi}, expected ${baseline.dpi}`);
  if (pdfInfo.pageCount !== baseline.pageCount) {
    failures.push(`PDF has ${pdfInfo.pageCount} pages, expected ${baseline.pageCount}`);
  }
  if (pdfInfo.pageSize !== baseline.pageSize) {
    failures.push(`PDF page size is ${pdfInfo.pageSize}, expected ${baseline.pageSize}`);
  }
  if (renderedPages.length !== baseline.pages.length) {
    failures.push(`rendered ${renderedPages.length} PNG pages, expected ${baseline.pages.length}`);
  }
  for (const [index, expected] of baseline.pages.entries()) {
    const actual = renderedPages[index];
    if (!actual) continue;
    if (actual.file !== expected.file) {
      failures.push(`page ${index + 1} is named ${actual.file}, expected ${expected.file}`);
    }
    if (actual.sha256 !== expected.sha256) {
      failures.push(
        `page ${index + 1} visual hash ${actual.sha256} differs from ${expected.sha256}`,
      );
    }
  }

  console.log(
    JSON.stringify({
      baselinePath,
      dpi,
      inputPath,
      pageCount: pdfInfo.pageCount,
      pageSize: pdfInfo.pageSize,
      renderedPages,
      status: failures.length ? "failed" : "passed",
    }),
  );
  if (failures.length) throw new Error(`PDF visual regression failed. ${failures.join("; ")}`);
}

void main();
