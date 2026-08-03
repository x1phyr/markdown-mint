#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import { validateThemeManifest } from "./index.js";

const path = process.argv[2];
if (!path) {
  console.error("Usage: markdown-mint-theme-check <manifest.json>");
  process.exitCode = 2;
} else {
  try {
    const input: unknown = JSON.parse(await readFile(path, "utf8"));
    const result = validateThemeManifest(input);
    if (!result.valid) {
      for (const item of result.issues) console.error(`${item.path}: ${item.message}`);
      process.exitCode = 1;
    } else {
      console.log(`Theme manifest is valid: ${String((input as { id?: unknown }).id)}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Could not read theme manifest.");
    process.exitCode = 1;
  }
}
