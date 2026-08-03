import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ExportJobManager } from "../src/jobs.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const themeDefaults = {
  "editorial-serif": { accentColor: "#8b4c35", density: "relaxed" },
  "minimal-report": { accentColor: "#44546a", density: "normal" },
  "technical-mint": { accentColor: "#2f735f", density: "normal" },
} as const;

function createPng(width = 2, height = 2): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes[19] = width;
  bytes[23] = height;
  return bytes;
}

function createRequest(markdown: string) {
  const themeId = process.env.PDF_COMPLEX_SMOKE_THEME ?? "technical-mint";
  const theme = themeDefaults[themeId as keyof typeof themeDefaults];
  if (!theme) throw new Error(`Unsupported PDF_COMPLEX_SMOKE_THEME: ${themeId}`);

  return {
    appearance: {
      accentColor: theme.accentColor,
      codeTheme: "github-light",
      density: theme.density,
      themeId,
    },
    document: {
      author: "MarkdownMint complex smoke",
      language: "zh-CN",
      title: "Complex fixture",
    },
    features: { cover: true, footer: true, header: true, pageNumber: true, toc: true },
    output: { format: "pdf" as const },
    page: { margin: "normal", orientation: "portrait", size: "A4" },
    source: {
      assets: [{ bytes: createPng(), mediaType: "image/png", path: "theme-sample.png" }],
      markdown,
    },
  };
}

async function main(): Promise<void> {
  const markdown = await readFile(join(repoRoot, "fixtures/p5-themes.md"), "utf8");
  const manager = new ExportJobManager({
    timeoutMs: Number.parseInt(process.env.PDF_COMPLEX_SMOKE_TIMEOUT_MS ?? "60000", 10),
  });

  try {
    const themeId = process.env.PDF_COMPLEX_SMOKE_THEME ?? "technical-mint";
    const job = manager.submit(createRequest(markdown), `pdf-complex-smoke-${themeId}`);
    const completed = await manager.waitFor(job.id);
    const bytes = manager.getArtifact(job.id);
    const thumbnail = manager.getThumbnail(job.id);
    if (
      completed?.state !== "succeeded" ||
      !completed.artifact ||
      completed.artifact.format !== "pdf" ||
      !bytes ||
      bytes.byteLength === 0 ||
      !thumbnail ||
      thumbnail.byteLength === 0 ||
      (completed.artifact.pageCount ?? 0) < 2
    ) {
      throw new Error(`Complex PDF smoke failed: ${JSON.stringify(completed)}`);
    }

    const outputPath = process.env.PDF_COMPLEX_SMOKE_OUTPUT;
    if (outputPath) {
      const absoluteOutputPath = resolve(outputPath);
      await mkdir(dirname(absoluteOutputPath), { recursive: true });
      await writeFile(absoluteOutputPath, bytes);
    }
    const thumbnailOutputPath = process.env.PDF_COMPLEX_SMOKE_THUMBNAIL_OUTPUT;
    if (thumbnailOutputPath) {
      const absoluteThumbnailPath = resolve(thumbnailOutputPath);
      await mkdir(dirname(absoluteThumbnailPath), { recursive: true });
      await writeFile(absoluteThumbnailPath, thumbnail);
    }

    console.log(
      JSON.stringify({
        artifact: completed.artifact,
        outputPath: outputPath ? resolve(outputPath) : undefined,
        state: completed.state,
        themeId,
        thumbnailOutputPath: thumbnailOutputPath ? resolve(thumbnailOutputPath) : undefined,
      }),
    );
  } finally {
    await manager.close();
  }
}

void main();
