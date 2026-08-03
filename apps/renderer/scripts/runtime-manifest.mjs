import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? resolve(".cache", "ms-playwright");
const manifestPath =
  process.env.RENDERER_RUNTIME_MANIFEST_PATH ?? "/usr/share/markdown-mint/runtime-manifest.json";
const noticesDirectory = process.env.RENDERER_NOTICES_DIR ?? "/usr/share/markdown-mint/licenses";
const sha256Pattern = /^[0-9a-f]{64}$/u;

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function fileRecord(filePath) {
  const stats = statSync(filePath);
  if (!stats.isFile()) throw new Error(`Expected a file: ${filePath}`);
  return { path: filePath, sha256: sha256(filePath), sizeBytes: stats.size };
}

function findExecutable(root, expectedNames) {
  const names = new Set(Array.isArray(expectedNames) ? expectedNames : [expectedNames]);
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const candidate = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(candidate);
      } else if (entry.isFile() && names.has(entry.name)) {
        return candidate;
      }
    }
  }
  throw new Error(`Could not find ${[...names].join(" or ")} below ${root}.`);
}

function revisionFor(root) {
  const revision = basename(root).match(/-(\d+)$/u)?.[1];
  if (!revision) throw new Error(`Could not determine a browser revision from ${root}.`);
  return revision;
}

function browserRecord(name, root, executable) {
  const record = fileRecord(executable);
  return { name, revision: revisionFor(root), ...record };
}

function packageVersion(packageName) {
  return execFileSync("dpkg-query", ["-W", `-f=${"${Version}"}`, packageName], {
    encoding: "utf8",
  }).trim();
}

function createManifest() {
  const playwrightPackage = require("playwright/package.json");
  const chromiumExecutable = chromium.executablePath();
  const chromiumRoot = resolve(dirname(dirname(chromiumExecutable)));
  const headlessRoot = readdirSync(browsersPath, { withFileTypes: true }).find(
    (entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"),
  );
  if (!headlessRoot)
    throw new Error(`Could not find a Chromium headless shell in ${browsersPath}.`);
  const headlessRootPath = join(browsersPath, headlessRoot.name);
  const headlessExecutable = findExecutable(headlessRootPath, [
    "headless_shell",
    "chrome-headless-shell",
  ]);

  const noticePaths = [
    join(noticesDirectory, "playwright-LICENSE"),
    join(noticesDirectory, "playwright-NOTICE"),
    join(noticesDirectory, "playwright-ThirdPartyNotices.txt"),
    join(noticesDirectory, "fonts-liberation-copyright"),
    join(noticesDirectory, "fonts-wqy-zenhei-copyright"),
  ];

  return {
    fonts: [
      { name: "fonts-liberation", version: packageVersion("fonts-liberation") },
      { name: "fonts-wqy-zenhei", version: packageVersion("fonts-wqy-zenhei") },
    ],
    nodeVersion: process.version,
    notices: noticePaths.map(fileRecord),
    playwright: {
      browsers: [
        browserRecord("chromium", chromiumRoot, chromiumExecutable),
        browserRecord("chromium-headless-shell", headlessRootPath, headlessExecutable),
      ],
      version: playwrightPackage.version,
    },
    schemaVersion: 1,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyManifest() {
  assert(existsSync(manifestPath), `Runtime manifest is missing: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert(manifest.schemaVersion === 1, "Runtime manifest schema version is unsupported.");
  assert(typeof manifest.nodeVersion === "string", "Runtime manifest has no Node version.");
  assert(
    typeof manifest.playwright?.version === "string",
    "Runtime manifest has no Playwright version.",
  );
  assert(
    manifest.playwright.browsers?.length === 2,
    "Runtime manifest must contain two Chromium records.",
  );

  for (const browser of manifest.playwright.browsers) {
    assert(/^\d+$/u.test(browser.revision), `Invalid browser revision for ${browser.name}.`);
    assert(sha256Pattern.test(browser.sha256), `Invalid browser checksum for ${browser.name}.`);
    const current = fileRecord(browser.path);
    assert(current.sha256 === browser.sha256, `Browser checksum changed: ${browser.name}.`);
    assert(current.sizeBytes === browser.sizeBytes, `Browser size changed: ${browser.name}.`);
  }
  for (const notice of manifest.notices ?? []) {
    const current = fileRecord(notice.path);
    assert(current.sha256 === notice.sha256, `Notice checksum changed: ${notice.path}.`);
    assert(current.sizeBytes === notice.sizeBytes, `Notice size changed: ${notice.path}.`);
  }
  assert(
    manifest.fonts?.every((font) => typeof font.version === "string" && font.version),
    "Font versions are missing.",
  );
  console.log(JSON.stringify(manifest));
}

const verify = process.argv.includes("--verify");
const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : manifestPath;

if (verify) {
  verifyManifest();
} else {
  if (!outputPath) throw new Error("--output requires a path.");
  const absoluteOutputPath = resolve(outputPath);
  mkdirSync(dirname(absoluteOutputPath), { mode: 0o755, recursive: true });
  writeFileSync(absoluteOutputPath, `${JSON.stringify(createManifest(), null, 2)}\n`, {
    mode: 0o644,
  });
  console.log(absoluteOutputPath);
}
