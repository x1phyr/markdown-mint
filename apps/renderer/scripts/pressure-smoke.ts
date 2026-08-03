import { ExportJobManager } from "../src/jobs.js";

const benchmarkPageCount = 20;
const pressurePageCount = 100;

function createRequest(title: string, pageCount: number) {
  const sections = Array.from({ length: pageCount }, (_, index) => {
    const page = index + 1;
    return [
      `## Pressure page ${page}`,
      "",
      "This deterministic pressure fixture exercises ordinary paragraphs, heading layout, and page transitions.",
      "The content is intentionally bounded so that a successful run can be compared across renderer revisions.",
      page === pageCount ? "" : "::pagebreak",
    ].join("\n");
  }).join("\n\n");

  return {
    appearance: {
      codeTheme: "github-light",
      density: "normal",
      themeId: "technical-mint",
    },
    document: { language: "en", title },
    features: { cover: false, footer: false, header: false, pageNumber: false, toc: false },
    output: { format: "pdf" },
    page: { margin: "normal", orientation: "portrait", size: "A4" },
    source: { assets: [], markdown: `# ${title}\n\n${sections}` },
  };
}

async function runJob(
  manager: ExportJobManager,
  title: string,
  pageCount: number,
  idempotencyKey: string,
) {
  const startedAt = performance.now();
  const submitted = manager.submit(createRequest(title, pageCount), idempotencyKey);
  const completed = await manager.waitFor(submitted.id);
  const durationMs = Math.round(performance.now() - startedAt);
  return {
    durationMs,
    error: completed?.error,
    pageCount: completed?.artifact?.pageCount,
    state: completed?.state,
  };
}

async function main(): Promise<void> {
  const pressureTimeoutMs = Number.parseInt(process.env.PRESSURE_TIMEOUT_MS ?? "30000", 10);
  const manager = new ExportJobManager({
    timeoutMs: pressureTimeoutMs,
  });
  const runs = Number.parseInt(process.env.PRESSURE_BENCHMARK_RUNS ?? "5", 10);

  try {
    const benchmark = [];
    for (let index = 0; index < runs; index += 1) {
      const result = await runJob(
        manager,
        `20-page pressure benchmark ${index + 1}`,
        benchmarkPageCount,
        `pressure-20-${index + 1}`,
      );
      if (result.state !== "succeeded" || result.pageCount !== benchmarkPageCount) {
        throw new Error(`20-page benchmark failed: ${JSON.stringify(result)}`);
      }
      benchmark.push(result);
    }

    const sortedDurations = benchmark.map((result) => result.durationMs).sort((a, b) => a - b);
    const p95Index = Math.min(
      sortedDurations.length - 1,
      Math.ceil(sortedDurations.length * 0.95) - 1,
    );
    const p95Ms = sortedDurations[p95Index] ?? 0;
    if (p95Ms > 15_000) throw new Error(`20-page P95 exceeded 15 seconds: ${p95Ms}ms`);

    const pressure = await runJob(
      manager,
      "100-page pressure fixture",
      pressurePageCount,
      "pressure-100",
    );
    if (pressure.state === "succeeded" && pressure.pageCount !== pressurePageCount) {
      throw new Error(
        `100-page pressure fixture returned the wrong page count: ${JSON.stringify(pressure)}`,
      );
    }
    if (pressure.state !== "succeeded" && pressure.error?.code !== "timeout") {
      throw new Error(
        `100-page pressure fixture failed without a stable timeout: ${JSON.stringify(pressure)}`,
      );
    }

    console.log(
      JSON.stringify({
        benchmark: { pageCount: benchmarkPageCount, p95Ms, runs: benchmark },
        pressure: { expectedPageCount: pressurePageCount, result: pressure },
        thresholds: { benchmarkP95Ms: 15_000, pressureTimeoutMs },
      }),
    );
  } finally {
    await manager.close();
  }
}

void main();
