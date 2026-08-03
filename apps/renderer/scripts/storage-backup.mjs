import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BACKUP_VERSION = 1;
const DATA_DIRECTORIES = ["jobs", "artifacts", "thumbnails"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/iu;
const FILE_PATTERNS = {
  artifacts: /^(?<id>[0-9a-f-]{36})\.bin$/iu,
  jobs: /^(?<id>[0-9a-f-]{36})\.json$/iu,
  thumbnails: /^(?<id>[0-9a-f-]{36})\.png$/iu,
};

/** @typedef {{path: string, sha256: string, sizeBytes: number}} BackupEntry */
/** @typedef {{archiveVersion: number, createdAt: string, entries: BackupEntry[]}} BackupManifest */

export class StorageBackupError extends Error {
  constructor(message) {
    super(message);
    this.name = "StorageBackupError";
  }
}

/**
 * Create a gzip-compressed POSIX tar archive of the renderer's storage.
 * The archive contains only the three storage directories and a hash manifest.
 * The caller is responsible for quiescing writes or using a filesystem snapshot.
 *
 * @param {string} dataDir
 * @param {string} archivePath
 * @returns {BackupManifest}
 */
export function createBackup(dataDir, archivePath) {
  const sourceDir = assertDataDirectory(dataDir);
  const outputPath = resolve(archivePath);
  if (existsSync(outputPath)) throw new StorageBackupError("Backup output already exists.");
  mkdirSync(dirname(outputPath), { mode: 0o700, recursive: true });

  const entries = scanStorage(sourceDir);
  const manifest = {
    archiveVersion: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    entries,
  };
  const stageDir = mkdtempSync(join(tmpdir(), "markdown-mint-storage-backup-"));
  const temporaryArchive = `${outputPath}.${randomUUID()}.tmp`;
  try {
    stageStorage(sourceDir, stageDir, entries);
    writeFileSync(join(stageDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    });
    runTar(["-czf", temporaryArchive, "-C", stageDir, "manifest.json", ...DATA_DIRECTORIES]);
    renameSync(temporaryArchive, outputPath);
    return manifest;
  } catch (error) {
    rmSync(temporaryArchive, { force: true });
    if (error instanceof StorageBackupError) throw error;
    throw new StorageBackupError(`Unable to create backup: ${errorMessage(error)}`);
  } finally {
    rmSync(stageDir, { force: true, recursive: true });
  }
}

/**
 * Validate an archive without changing the target storage directory.
 *
 * @param {string} archivePath
 * @returns {BackupManifest}
 */
export function verifyBackup(archivePath) {
  const archive = assertArchive(archivePath);
  const stageDir = mkdtempSync(join(tmpdir(), "markdown-mint-storage-verify-"));
  try {
    return extractAndValidate(archive, stageDir).manifest;
  } finally {
    rmSync(stageDir, { force: true, recursive: true });
  }
}

/**
 * Validate an archive and restore it into a fresh or explicitly forced data directory.
 * Existing unexpected files and symlinks are always rejected.
 *
 * @param {string} archivePath
 * @param {string} dataDir
 * @param {{force?: boolean}} [options]
 * @returns {BackupManifest}
 */
export function restoreBackup(archivePath, dataDir, options = {}) {
  const archive = assertArchive(archivePath);
  const targetDir = assertDataDirectoryTarget(dataDir);
  const stageDir = mkdtempSync(join(tmpdir(), "markdown-mint-storage-restore-"));
  try {
    const { manifest } = extractAndValidate(archive, stageDir);
    prepareRestoreTarget(targetDir, options.force === true);
    mkdirSync(targetDir, { mode: 0o700, recursive: true });
    for (const directory of DATA_DIRECTORIES) {
      const source = join(stageDir, directory);
      const destination = join(targetDir, directory);
      if (existsSync(destination)) rmSync(destination, { force: true, recursive: true });
      renameSync(source, destination);
    }
    setPrivateModes(targetDir);
    return manifest;
  } finally {
    rmSync(stageDir, { force: true, recursive: true });
  }
}

function assertArchive(archivePath) {
  const candidate = resolve(archivePath);
  try {
    const stat = lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("not a regular file");
  } catch (error) {
    throw new StorageBackupError(
      `Backup archive is unavailable: ${candidate} (${errorMessage(error)}).`,
    );
  }
  return candidate;
}

function assertDataDirectory(dataDir) {
  const candidate = resolve(dataDir);
  try {
    const stat = lstatSync(candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("not a regular directory");
  } catch (error) {
    throw new StorageBackupError(
      `Storage directory is unavailable: ${candidate} (${errorMessage(error)}).`,
    );
  }
  return candidate;
}

function assertDataDirectoryTarget(dataDir) {
  const candidate = resolve(dataDir);
  if (candidate === resolve(candidate, "..") || candidate === "/") {
    throw new StorageBackupError("Refusing to restore into a filesystem root.");
  }
  if (existsSync(candidate)) {
    try {
      const stat = lstatSync(candidate);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("not a regular directory");
    } catch (error) {
      throw new StorageBackupError(
        `Restore target is unavailable: ${candidate} (${errorMessage(error)}).`,
      );
    }
  }
  return candidate;
}

function scanStorage(sourceDir) {
  const entries = [];
  const rootEntries = readdirSync(sourceDir, { withFileTypes: true });
  const expectedDirectories = new Set(DATA_DIRECTORIES);
  for (const rootEntry of rootEntries) {
    if (!expectedDirectories.has(rootEntry.name) || !rootEntry.isDirectory()) {
      throw new StorageBackupError(`Unexpected storage root entry: ${rootEntry.name}`);
    }
  }

  for (const directory of DATA_DIRECTORIES) {
    const directoryPath = join(sourceDir, directory);
    if (!existsSync(directoryPath)) continue;
    for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new StorageBackupError(`Unexpected storage entry: ${directory}/${entry.name}`);
      }
      const pattern = FILE_PATTERNS[directory];
      if (!pattern.test(entry.name) || !UUID_PATTERN.test(uuidFromFileName(entry.name))) {
        throw new StorageBackupError(`Unexpected storage entry: ${directory}/${entry.name}`);
      }
      const path = `${directory}/${entry.name}`;
      const bytes = readFileSync(join(directoryPath, entry.name));
      entries.push({ path, sha256: sha256(bytes), sizeBytes: bytes.byteLength });
    }
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function stageStorage(sourceDir, stageDir, entries) {
  for (const directory of DATA_DIRECTORIES) {
    mkdirSync(join(stageDir, directory), { mode: 0o700 });
  }
  for (const entry of entries) {
    const source = join(sourceDir, entry.path);
    const destination = join(stageDir, entry.path);
    copyFileSync(source, destination);
    chmodSync(destination, 0o600);
  }
}

function extractAndValidate(archive, stageDir) {
  const names = listArchiveEntries(archive);
  const types = listArchiveTypes(archive);
  if (names.length !== types.size || names.some((name) => !types.has(name))) {
    throw new StorageBackupError("Backup archive entries and file types do not match.");
  }
  if (!names.includes("manifest.json")) {
    throw new StorageBackupError("Backup archive is missing manifest.json.");
  }

  runTar(["-xzf", archive, "-C", stageDir]);
  const manifest = parseManifest(readFileSync(join(stageDir, "manifest.json"), "utf8"));
  const expectedFiles = new Set(["manifest.json", ...manifest.entries.map((entry) => entry.path)]);
  const actualFiles = new Set(names.filter((name) => !name.endsWith("/")));
  if (
    expectedFiles.size !== actualFiles.size ||
    [...expectedFiles].some((name) => !actualFiles.has(name))
  ) {
    throw new StorageBackupError("Backup manifest does not match archive contents.");
  }

  for (const entry of manifest.entries) {
    const filePath = join(stageDir, entry.path);
    const stat = lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new StorageBackupError(`Backup entry is not a regular file: ${entry.path}`);
    }
    const bytes = readFileSync(filePath);
    if (bytes.byteLength !== entry.sizeBytes || sha256(bytes) !== entry.sha256) {
      throw new StorageBackupError(`Backup checksum mismatch: ${entry.path}`);
    }
  }
  return { manifest, names };
}

function listArchiveEntries(archive) {
  const names = runTar(["-tzf", archive])
    .split(/\r?\n/u)
    .map((line) => normalizeArchiveName(line.trim()))
    .filter(Boolean);
  const unique = new Set(names);
  if (unique.size !== names.length)
    throw new StorageBackupError("Backup archive contains duplicate entries.");
  for (const name of names) validateArchiveName(name);
  return names;
}

function listArchiveTypes(archive) {
  const types = new Set();
  for (const line of runTar(["-tvzf", archive]).split(/\r?\n/u).filter(Boolean)) {
    const type = line[0];
    if (type !== "-" && type !== "d") {
      throw new StorageBackupError(
        "Backup archive contains a symlink, hard link, or special file.",
      );
    }
    const name = normalizeArchiveName(line.trim().split(/\s+/u).at(-1) ?? "");
    validateArchiveName(name);
    types.add(name);
  }
  return types;
}

function normalizeArchiveName(name) {
  return name.startsWith("./") ? name.slice(2) : name;
}

function validateArchiveName(name) {
  if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) {
    throw new StorageBackupError(`Unsafe archive path: ${name}`);
  }
  if (name === "manifest.json" || DATA_DIRECTORIES.some((directory) => name === `${directory}/`)) {
    return;
  }
  const [directory, fileName] = name.split("/");
  const pattern = FILE_PATTERNS[directory];
  if (
    !pattern ||
    !fileName ||
    !pattern.test(fileName) ||
    !UUID_PATTERN.test(uuidFromFileName(fileName))
  ) {
    throw new StorageBackupError(`Unexpected archive path: ${name}`);
  }
}

function uuidFromFileName(fileName) {
  return fileName.slice(0, fileName.lastIndexOf("."));
}

function parseManifest(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new StorageBackupError("Backup manifest is not valid JSON.");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    parsed.archiveVersion !== BACKUP_VERSION ||
    typeof parsed.createdAt !== "string" ||
    !Array.isArray(parsed.entries)
  ) {
    throw new StorageBackupError("Backup manifest has an unsupported schema.");
  }
  const entries = parsed.entries.map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.path !== "string" ||
      typeof entry.sha256 !== "string" ||
      !SHA256_PATTERN.test(entry.sha256) ||
      !Number.isSafeInteger(entry.sizeBytes) ||
      entry.sizeBytes < 0
    ) {
      throw new StorageBackupError("Backup manifest contains an invalid entry.");
    }
    validateArchiveName(entry.path);
    if (entry.path === "manifest.json" || entry.path.endsWith("/")) {
      throw new StorageBackupError("Backup manifest contains a non-file entry.");
    }
    return { path: entry.path, sha256: entry.sha256, sizeBytes: entry.sizeBytes };
  });
  const paths = new Set(entries.map((entry) => entry.path));
  if (paths.size !== entries.length)
    throw new StorageBackupError("Backup manifest contains duplicates.");
  return {
    archiveVersion: parsed.archiveVersion,
    createdAt: parsed.createdAt,
    entries,
  };
}

function prepareRestoreTarget(targetDir, force) {
  if (!existsSync(targetDir)) return;
  const entries = readdirSync(targetDir, { withFileTypes: true });
  if (entries.length === 0) return;
  if (!force) {
    throw new StorageBackupError("Restore target is not empty; pass --force after reviewing it.");
  }
  const expected = new Set(DATA_DIRECTORIES);
  for (const entry of entries) {
    if (!expected.has(entry.name) || entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new StorageBackupError(
        `Refusing to remove unexpected restore target entry: ${entry.name}`,
      );
    }
  }
}

function setPrivateModes(directory) {
  chmodSync(directory, 0o700);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      setPrivateModes(path);
    } else if (entry.isFile() && !entry.isSymbolicLink()) {
      chmodSync(path, 0o600);
    }
  }
}

function runTar(args) {
  try {
    return execFileSync("tar", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    throw new StorageBackupError(`tar operation failed: ${errorMessage(error)}`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith("--")) {
    throw new StorageBackupError(`Missing required option: ${name}`);
  }
  return args[index + 1];
}

function usage() {
  return [
    "Usage:",
    "  node storage-backup.mjs create --data-dir <dir> --output <archive.tgz>",
    "  node storage-backup.mjs verify --archive <archive.tgz>",
    "  node storage-backup.mjs restore --archive <archive.tgz> --data-dir <dir> [--force]",
  ].join("\n");
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command) throw new StorageBackupError(usage());
  if (command === "create") {
    const manifest = createBackup(option(args, "--data-dir"), option(args, "--output"));
    console.log(
      JSON.stringify({
        command,
        entries: manifest.entries.length,
        output: resolve(option(args, "--output")),
      }),
    );
    return;
  }
  if (command === "verify") {
    const manifest = verifyBackup(option(args, "--archive"));
    console.log(
      JSON.stringify({ command, entries: manifest.entries.length, createdAt: manifest.createdAt }),
    );
    return;
  }
  if (command === "restore") {
    const manifest = restoreBackup(option(args, "--archive"), option(args, "--data-dir"), {
      force: args.includes("--force"),
    });
    console.log(
      JSON.stringify({
        command,
        entries: manifest.entries.length,
        target: resolve(option(args, "--data-dir")),
      }),
    );
    return;
  }
  throw new StorageBackupError(usage());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
