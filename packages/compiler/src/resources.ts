import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface ResourceAsset {
  path: string;
  bytes: Uint8Array;
  mediaType?: string;
}

export interface ResourceCandidate {
  kind: "image";
  url: string;
}

export interface ResourcePolicy {
  allowRemote: boolean;
  maxAssetBytes: number;
  maxImagePixels: number;
  maxRedirects: number;
  maxResources: number;
  maxTotalBytes: number;
  requestTimeoutMs: number;
}

export const DEFAULT_RESOURCE_POLICY: ResourcePolicy = {
  allowRemote: false,
  maxAssetBytes: 8 * 1024 * 1024,
  maxImagePixels: 40_000_000,
  maxRedirects: 3,
  maxResources: 32,
  maxTotalBytes: 32 * 1024 * 1024,
  requestTimeoutMs: 5_000,
};

export type ResourceStatus = "blocked" | "failed" | "ready";

export interface ResourceManifestEntry {
  bytes: number;
  id: string;
  mediaType: string;
  path: string;
  source: string;
  sources: string[];
  status: ResourceStatus;
  width?: number;
  height?: number;
  errorCode?: string;
  reason?: string;
}

export interface ResourceManifest {
  entries: ResourceManifestEntry[];
  totalBytes: number;
}

export interface ResourceDiagnostic {
  level: "warning" | "error";
  message: string;
  rule: string;
  source: string;
  suggestion: string;
}

export interface ResourceResolutionOptions {
  assets?: readonly ResourceAsset[];
  cache?: Map<string, Uint8Array>;
  fetcher?: typeof fetch;
  lookupHost?: (hostname: string) => Promise<readonly string[]>;
  policy?: Partial<ResourcePolicy>;
}

export interface ResourceResolutionResult {
  bySource: Map<string, ResourceManifestEntry>;
  diagnostics: ResourceDiagnostic[];
  manifest: ResourceManifest;
}

interface ImageInfo {
  height?: number;
  mediaType: string;
  width?: number;
}

interface RemoteBytes {
  bytes: Uint8Array;
  finalUrl: string;
  mediaType?: string;
}

class ResourceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ResourceError";
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesEqual(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function detectJpeg(bytes: Uint8Array): ImageInfo | undefined {
  if (!bytesEqual(bytes, [0xff, 0xd8, 0xff])) return undefined;

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1] ?? 0;
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) break;
    const length = readUint16BE(bytes, offset);
    if (length < 2 || offset + length > bytes.length) break;

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame && offset + 7 < bytes.length) {
      return {
        height: readUint16BE(bytes, offset + 3),
        mediaType: "image/jpeg",
        width: readUint16BE(bytes, offset + 5),
      };
    }
    offset += length;
  }

  return { mediaType: "image/jpeg" };
}

function detectWebp(bytes: Uint8Array): ImageInfo | undefined {
  if (
    bytes.length < 16 ||
    String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" ||
    String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP"
  ) {
    return undefined;
  }

  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      height: readUint24LE(bytes, 27) + 1,
      mediaType: "image/webp",
      width: readUint24LE(bytes, 24) + 1,
    };
  }

  return { mediaType: "image/webp" };
}

function detectImage(bytes: Uint8Array, declaredMediaType?: string): ImageInfo | undefined {
  if (bytesEqual(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && bytes.length >= 24) {
    return {
      height: readUint32BE(bytes, 20),
      mediaType: "image/png",
      width: readUint32BE(bytes, 16),
    };
  }

  if (bytesEqual(bytes, [0x47, 0x49, 0x46, 0x38]) && bytes.length >= 10) {
    return {
      height: readUint16LE(bytes, 8),
      mediaType: "image/gif",
      width: readUint16LE(bytes, 6),
    };
  }

  const jpeg = detectJpeg(bytes);
  if (jpeg) return jpeg;

  const webp = detectWebp(bytes);
  if (webp) return webp;

  const text = new TextDecoder().decode(bytes);
  if (/^\s*<svg(?:\s|>)/iu.test(text)) {
    if (/<script\b|<foreignObject\b|\bon[a-z][\w:-]*\s*=|javascript:/iu.test(text)) {
      return undefined;
    }
    return { mediaType: "image/svg+xml" };
  }

  if (declaredMediaType?.startsWith("image/") && declaredMediaType !== "image/svg+xml") {
    return undefined;
  }

  return undefined;
}

function extensionForMediaType(mediaType: string): string {
  switch (mediaType) {
    case "image/gif":
      return "gif";
    case "image/jpeg":
      return "jpg";
    case "image/svg+xml":
      return "svg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

function normalizedAssetPath(path: string): string | undefined {
  const value = path.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (!value || value.includes("\0")) return undefined;
  const parts = value.split("/");
  if (parts.some((part) => part === ".." || part === "")) return undefined;
  return parts.join("/");
}

function assetKeyForUrl(url: string): string | undefined {
  const withoutQuery = url.split(/[?#]/u)[0] ?? "";
  return normalizedAssetPath(withoutQuery);
}

function ipv4IsPrivate(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const first = parts[0];
  const second = parts[1];
  if (first === undefined) return false;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second !== undefined && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && second !== undefined && second >= 18 && second <= 19) ||
    first >= 224
  );
}

function ipv6IsPrivate(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return (
    value === "::1" ||
    value === "::" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb") ||
    value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:192.168.") ||
    value.startsWith("::ffff:172.16.")
  );
}

export function isPrivateNetworkHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/u, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true;
  }

  if (isIP(normalized) === 4) return ipv4IsPrivate(normalized);
  if (isIP(normalized) === 6) return ipv6IsPrivate(normalized);
  return false;
}

export async function assertSafeRemoteUrl(
  rawUrl: string,
  resolveHost?: (hostname: string) => Promise<readonly string[]>,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ResourceError("remote-url", "Remote resource URL is not valid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ResourceError("remote-protocol", "Remote resources require HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new ResourceError("remote-credentials", "Remote resource credentials are not allowed.");
  }
  if (isPrivateNetworkHost(url.hostname)) {
    throw new ResourceError(
      "remote-ssrf",
      "Remote resource points to a private or local network host.",
    );
  }

  if (resolveHost && isIP(url.hostname) === 0) {
    let addresses: readonly string[];
    try {
      addresses = await resolveHost(url.hostname);
    } catch {
      throw new ResourceError("remote-dns", "Remote resource hostname could not be resolved.");
    }
    if (addresses.some(isPrivateNetworkHost)) {
      throw new ResourceError(
        "remote-ssrf",
        "Remote resource resolves to a private or local network host.",
      );
    }
  }

  url.hash = "";
  return url;
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ResourceError("resource-size", "Remote resource exceeds the configured size limit.");
  }

  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new ResourceError(
        "resource-size",
        "Remote resource exceeds the configured size limit.",
      );
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ResourceError(
        "resource-size",
        "Remote resource exceeds the configured size limit.",
      );
    }
    chunks.push(chunk.value);
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function fetchRemoteResource(
  rawUrl: string,
  policy: ResourcePolicy,
  options: ResourceResolutionOptions,
): Promise<RemoteBytes> {
  const fetcher = options.fetcher ?? fetch;
  const resolveHost =
    options.lookupHost ??
    (options.fetcher
      ? undefined
      : async (hostname: string) => {
          const records = await lookup(hostname, { all: true });
          return records.map((record) => record.address);
        });
  let currentUrl = (await assertSafeRemoteUrl(rawUrl, resolveHost)).href;

  for (let redirect = 0; redirect <= policy.maxRedirects; redirect += 1) {
    const cached = options.cache?.get(currentUrl);
    if (cached) return { bytes: cached, finalUrl: currentUrl };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), policy.requestTimeoutMs);
    try {
      const response = await fetcher(currentUrl, { redirect: "manual", signal: controller.signal });

      if (response.status >= 300 && response.status < 400) {
        if (redirect >= policy.maxRedirects) {
          throw new ResourceError(
            "remote-redirect",
            "Remote resource exceeded the redirect limit.",
          );
        }
        const location = response.headers.get("location");
        if (!location)
          throw new ResourceError(
            "remote-redirect",
            "Remote resource returned an invalid redirect.",
          );
        currentUrl = (await assertSafeRemoteUrl(new URL(location, currentUrl).href, resolveHost))
          .href;
        continue;
      }

      if (!response.ok) {
        throw new ResourceError("remote-http", `Remote resource returned HTTP ${response.status}.`);
      }

      const bytes = await readResponseBytes(response, policy.maxAssetBytes);
      options.cache?.set(currentUrl, bytes);
      const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
      return {
        bytes,
        finalUrl: currentUrl,
        ...(mediaType ? { mediaType } : {}),
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ResourceError("remote-timeout", "Remote resource request timed out.");
      }
      if (error instanceof ResourceError) throw error;
      const message = error instanceof Error ? error.message : "Remote resource request failed.";
      throw new ResourceError("remote-request", message);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new ResourceError("remote-redirect", "Remote resource could not be resolved.");
}

function diagnosticForError(error: ResourceError, source: string): ResourceDiagnostic {
  const remote = source.startsWith("http://") || source.startsWith("https://");
  return {
    level: error.code === "remote-http" ? "warning" : "error",
    message: `Resource ${source} was not included: ${error.message}`,
    rule: error.code,
    source,
    suggestion: remote
      ? "Use a permitted HTTPS resource or provide the asset as an upload."
      : "Provide a supported local image within the configured size and pixel limits.",
  };
}

function createFailedEntry(source: string, error: ResourceError): ResourceManifestEntry {
  return {
    bytes: 0,
    errorCode: error.code,
    id: `failed-${sha256(new TextEncoder().encode(source)).slice(0, 16)}`,
    mediaType: "application/octet-stream",
    path: "",
    reason: error.message,
    source,
    sources: [source],
    status:
      (error.code.startsWith("remote-") || error.code === "remote-disabled") &&
      error.code !== "remote-http"
        ? "blocked"
        : "failed",
  };
}

export async function resolveResources(
  candidates: readonly ResourceCandidate[],
  options: ResourceResolutionOptions = {},
): Promise<ResourceResolutionResult> {
  const policy: ResourcePolicy = { ...DEFAULT_RESOURCE_POLICY, ...options.policy };
  const assets = new Map<string, ResourceAsset>();
  for (const asset of options.assets ?? []) {
    const key = normalizedAssetPath(asset.path);
    if (key) assets.set(key, asset);
  }

  const manifest: ResourceManifest = { entries: [], totalBytes: 0 };
  const bySource = new Map<string, ResourceManifestEntry>();
  const diagnostics: ResourceDiagnostic[] = [];
  const byHash = new Map<string, ResourceManifestEntry>();
  const seenSources = new Set<string>();

  for (const candidate of candidates) {
    const source = candidate.url;
    if (seenSources.has(source)) continue;
    seenSources.add(source);

    let bytes: Uint8Array;
    let declaredMediaType: string | undefined;
    try {
      if (seenSources.size > policy.maxResources) {
        throw new ResourceError("resource-count", "The document exceeds the resource count limit.");
      }

      if (source.startsWith("http://") || source.startsWith("https://")) {
        if (!policy.allowRemote) {
          throw new ResourceError("remote-disabled", "Remote resources are disabled by policy.");
        }
        const remote = await fetchRemoteResource(source, policy, options);
        bytes = remote.bytes;
        declaredMediaType = remote.mediaType;
      } else {
        const asset = assets.get(assetKeyForUrl(source) ?? "");
        if (!asset) throw new ResourceError("asset-missing", "Local image asset was not provided.");
        bytes = asset.bytes;
        declaredMediaType = asset.mediaType;
      }

      if (bytes.byteLength > policy.maxAssetBytes) {
        throw new ResourceError("resource-size", "Image exceeds the configured size limit.");
      }

      const image = detectImage(bytes, declaredMediaType);
      if (!image) throw new ResourceError("image-format", "Image format is unsupported or unsafe.");
      if (
        image.width !== undefined &&
        image.height !== undefined &&
        image.width * image.height > policy.maxImagePixels
      ) {
        throw new ResourceError("image-pixels", "Image exceeds the configured pixel limit.");
      }
      if (manifest.totalBytes + bytes.byteLength > policy.maxTotalBytes) {
        throw new ResourceError(
          "resource-total-size",
          "Document resources exceed the total size limit.",
        );
      }

      const digest = sha256(bytes);
      const duplicate = byHash.get(digest);
      if (duplicate) {
        duplicate.sources.push(source);
        bySource.set(source, duplicate);
        continue;
      }

      const extension = extensionForMediaType(image.mediaType);
      const entry: ResourceManifestEntry = {
        bytes: bytes.byteLength,
        id: `asset-${digest.slice(0, 16)}`,
        mediaType: image.mediaType,
        path: `assets/asset-${digest.slice(0, 16)}.${extension}`,
        source,
        sources: [source],
        status: "ready",
      };
      if (image.width !== undefined) entry.width = image.width;
      if (image.height !== undefined) entry.height = image.height;
      manifest.entries.push(entry);
      manifest.totalBytes += bytes.byteLength;
      byHash.set(digest, entry);
      bySource.set(source, entry);
    } catch (error) {
      const resourceError =
        error instanceof ResourceError
          ? error
          : new ResourceError("resource-failed", "Resource processing failed.");
      const entry = createFailedEntry(source, resourceError);
      manifest.entries.push(entry);
      bySource.set(source, entry);
      diagnostics.push(diagnosticForError(resourceError, source));
    }
  }

  return { bySource, diagnostics, manifest };
}
