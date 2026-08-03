import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { ExportJobManager } from "../src/jobs.js";

const themeDefaults = {
  "editorial-serif": { accentColor: "#8b4c35", density: "relaxed" },
  "minimal-report": { accentColor: "#44546a", density: "normal" },
  "technical-mint": { accentColor: "#2f735f", density: "normal" },
} as const;

function createRequest() {
  const themeId = process.env.PDF_SMOKE_THEME ?? "technical-mint";
  const theme = themeDefaults[themeId as keyof typeof themeDefaults];
  if (!theme) throw new Error(`Unsupported PDF_SMOKE_THEME: ${themeId}`);

  const sections = Array.from(
    { length: 16 },
    (_, index) => `## Section ${index + 1}\n\n${"Paged content. ".repeat(80)}`,
  ).join("\n\n");

  return {
    appearance: {
      accentColor: theme.accentColor,
      codeTheme: "github-light",
      density: theme.density,
      themeId,
    },
    document: { author: "MarkdownMint smoke", language: "en", title: "Chromium smoke" },
    features: { cover: true, footer: true, header: true, pageNumber: true, toc: true },
    output: { format: "pdf" },
    page: { margin: "normal", orientation: "portrait", size: "A4" },
    source: { assets: [], markdown: `# Chromium smoke\n\n${sections}` },
  };
}

async function main(): Promise<void> {
  const manager = new ExportJobManager();
  try {
    const job = manager.submit(createRequest(), "pdf-smoke");
    const completed = await manager.waitFor(job.id);
    const bytes = manager.getArtifact(job.id);
    if (completed?.state !== "succeeded" || !bytes || !completed.artifact) {
      throw new Error(completed?.error?.message ?? "PDF smoke export did not succeed.");
    }

    const outputPath = process.env.PDF_SMOKE_OUTPUT;
    if (outputPath) {
      const absoluteOutputPath = resolve(outputPath);
      await mkdir(dirname(absoluteOutputPath), { recursive: true });
      await writeFile(absoluteOutputPath, bytes);
    }

    const thumbnail = manager.getThumbnail(job.id);
    const thumbnailOutputPath = process.env.PDF_SMOKE_THUMBNAIL_OUTPUT;
    let writtenThumbnailPath: string | undefined;
    if (thumbnail && thumbnailOutputPath) {
      const absoluteThumbnailOutputPath = resolve(thumbnailOutputPath);
      await mkdir(dirname(absoluteThumbnailOutputPath), { recursive: true });
      await writeFile(absoluteThumbnailOutputPath, thumbnail);
      writtenThumbnailPath = absoluteThumbnailOutputPath;
    }

    console.log(
      JSON.stringify({
        artifact: completed.artifact,
        outputPath: outputPath ? resolve(outputPath) : undefined,
        thumbnailOutputPath: writtenThumbnailPath,
        state: completed.state,
      }),
    );
  } finally {
    await manager.close();
  }
}

void main();
