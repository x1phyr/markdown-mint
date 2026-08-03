import { spawn } from "node:child_process";
import process from "node:process";

import AxeBuilder from "@axe-core/playwright";
import { chromium, firefox, webkit } from "playwright";

const browserName = process.env.E2E_BROWSER ?? "chromium";
const browserTypes = { chromium, firefox, webkit };
const browserType = browserTypes[browserName];
if (!browserType) throw new Error(`Unsupported E2E_BROWSER: ${browserName}`);

const port = Number.parseInt(process.env.E2E_PORT ?? "4390", 10);
const baseUrl = `http://127.0.0.1:${port}`;
const rendererPort = Number.parseInt(process.env.E2E_RENDERER_PORT ?? "4310", 10);
const rendererUrl = `http://127.0.0.1:${rendererPort}`;
const exportResultTimeoutMs = Number.parseInt(process.env.E2E_EXPORT_TIMEOUT_MS ?? "90000", 10);
const child = spawn("node", ["apps/web/.output/server/index.mjs"], {
  env: { ...process.env, HOST: "127.0.0.1", NITRO_PORT: String(port), PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
const renderer = spawn("node", ["apps/renderer/dist/server.js"], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(rendererPort),
    RENDERER_CORS_ORIGIN: baseUrl,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let childOutput = "";
let rendererOutput = "";
child.stdout.on("data", (chunk) => {
  childOutput = `${childOutput}${chunk.toString()}`.slice(-4000);
});
child.stderr.on("data", (chunk) => {
  childOutput = `${childOutput}${chunk.toString()}`.slice(-4000);
});
renderer.stdout.on("data", (chunk) => {
  rendererOutput = `${rendererOutput}${chunk.toString()}`.slice(-4000);
});
renderer.stderr.on("data", (chunk) => {
  rendererOutput = `${rendererOutput}${chunk.toString()}`.slice(-4000);
});

async function waitForEndpoint(url, label, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not start. ${output()}`);
}

async function waitForServers() {
  await Promise.all([
    waitForEndpoint(baseUrl, "Web server", () => childOutput),
    waitForEndpoint(`${rendererUrl}/health`, "Renderer server", () => rendererOutput),
  ]);
}

async function gotoStable(page, url) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  return response;
}

async function assertAccessible(page, path) {
  const results = await new AxeBuilder({ page }).analyze();
  if (!results.violations.length) return;

  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      failureSummary: node.failureSummary,
    })),
  }));
  throw new Error(`${path} has accessibility violations: ${JSON.stringify(summary)}`);
}

async function stopProcess(childProcess) {
  if (childProcess.exitCode !== null) return;
  childProcess.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    childProcess.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (childProcess.exitCode === null) childProcess.kill("SIGKILL");
}

async function run() {
  await waitForServers();
  const browserEnv = { ...process.env };
  for (const key of [
    "ALL_PROXY",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "all_proxy",
    "http_proxy",
    "https_proxy",
  ]) {
    delete browserEnv[key];
  }
  const browserOptions = { env: browserEnv, headless: true };
  if (browserName === "firefox") {
    browserOptions.firefoxUserPrefs = { "network.proxy.type": 0 };
  }
  const browser = await browserType.launch(browserOptions);
  const context = await browser.newContext({
    acceptDownloads: true,
    locale: "en-US",
    viewport: { height: 900, width: 1440 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const attachDiagnostics = (targetPage) => {
    targetPage.on("pageerror", (error) => pageErrors.push(error.message));
    targetPage.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
  };
  attachDiagnostics(page);

  try {
    for (const path of ["/", "/themes", "/themes/technical-mint"]) {
      const response = await gotoStable(page, `${baseUrl}${path}`);
      if (!response?.ok()) throw new Error(`${path} returned ${response?.status()}`);
      const main = page.locator("main");
      if ((await main.count()) !== 1) throw new Error(`${path} has no unique main landmark`);
      const duplicateIds = await page.evaluate(() => {
        const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
        return ids.filter((id, index) => ids.indexOf(id) !== index);
      });
      if (duplicateIds?.length)
        throw new Error(`${path} has duplicate ids: ${duplicateIds.join(", ")}`);
      await assertAccessible(page, path);
    }

    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "载入示例" }).click();
    if ((await page.locator("html").getAttribute("lang")) !== "zh-CN") {
      throw new Error("Loading the sample changed the UI language from Chinese.");
    }
    await page.getByRole("button", { name: "下一步" }).first().click();
    await page.getByRole("button", { name: "下一步" }).last().click();
    await page.getByRole("button", { name: "生成" }).click();
    await page
      .locator("#result-title")
      .waitFor({ state: "visible", timeout: exportResultTimeoutMs });
    if ((await page.locator(".artifact-card").count()) !== 1) {
      throw new Error("Export result did not expose exactly one artifact card.");
    }
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载产物" }).click();
    const download = await downloadPromise;
    if (!/\.pdf$/iu.test(download.suggestedFilename())) {
      throw new Error(`Expected a PDF download, received ${download.suggestedFilename()}.`);
    }

    const mobile = await context.newPage();
    attachDiagnostics(mobile);
    await mobile.setViewportSize({ height: 800, width: 390 });
    const mobileResponse = await gotoStable(mobile, `${baseUrl}/`);
    if (!mobileResponse?.ok()) throw new Error(`mobile home returned ${mobileResponse?.status()}`);
    if ((await mobile.getByRole("main").count()) !== 1)
      throw new Error("mobile home has no main landmark");
    await assertAccessible(mobile, "/ (mobile)");
    await mobile.close();

    if (pageErrors.length || consoleErrors.length) {
      throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
    }
    console.log(
      JSON.stringify({ browser: browserName, paths: ["/", "/themes", "/themes/technical-mint"] }),
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

try {
  await run();
} finally {
  await Promise.all([stopProcess(child), stopProcess(renderer)]);
}
