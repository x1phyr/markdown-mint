/**
 * Path matching for local Markdown image attachments.
 * Mirrors packages/compiler `normalizedAssetPath` / `assetKeyForUrl` rules:
 * exact match after stripping `./`, rejecting `..` and empty segments.
 */

const IMAGE_REF_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/gu;

export function normalizeAssetPath(path: string): string | undefined {
  const value = path.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (!value || value.includes("\0")) return undefined;
  try {
    const decoded = decodeURIComponent(value);
    const parts = decoded.split("/");
    if (parts.some((part) => part === ".." || part === "")) return undefined;
    return parts.join("/");
  } catch {
    return undefined;
  }
}

export function assetBasename(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? normalized;
}

export function isRemoteOrSpecialImageUrl(url: string): boolean {
  const value = url.trim();
  if (!value) return true;
  if (value.startsWith("#") || value.startsWith("?")) return true;
  if (value.startsWith("//") || value.startsWith("/")) return true;
  return /^[a-z][a-z0-9+.-]*:/iu.test(value);
}

/** Normalized local image paths referenced by Markdown, in document order, deduped. */
export function listLocalImageRefs(markdown: string): string[] {
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const match of markdown.matchAll(IMAGE_REF_PATTERN)) {
    const raw = match[2]?.trim() ?? "";
    if (!raw || isRemoteOrSpecialImageUrl(raw)) continue;
    const normalized = normalizeAssetPath(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    refs.push(normalized);
  }
  return refs;
}

export function unmatchedLocalImageRefs(
  markdownRefs: readonly string[],
  attachedPaths: readonly string[],
): string[] {
  const attached = new Set(
    attachedPaths
      .map((path) => normalizeAssetPath(path))
      .filter((path): path is string => Boolean(path)),
  );
  return markdownRefs.filter((ref) => !attached.has(ref));
}

function candidatePathsForFile(file: { name: string; webkitRelativePath?: string }): string[] {
  const candidates: string[] = [];
  const relative = file.webkitRelativePath?.trim();
  if (relative) {
    const normalizedRelative = normalizeAssetPath(relative);
    if (normalizedRelative) candidates.push(normalizedRelative);
    // Directory pickers prefix the selected folder name; also try without it.
    const withoutRoot = relative.replaceAll("\\", "/").split("/").slice(1).join("/");
    const normalizedWithoutRoot = normalizeAssetPath(withoutRoot);
    if (normalizedWithoutRoot) candidates.push(normalizedWithoutRoot);
  }
  const base = normalizeAssetPath(assetBasename(file.name));
  if (base) candidates.push(base);
  return [...new Set(candidates)];
}

/**
 * Choose an attach path that will match Markdown refs when possible.
 * Prefer an unmatched ref that uniquely shares the file basename; otherwise
 * keep the best filesystem-relative candidate (or basename).
 */
export function resolveAttachedAssetPath(
  file: { name: string; webkitRelativePath?: string },
  unmatchedRefs: readonly string[],
): string | undefined {
  const candidates = candidatePathsForFile(file);
  if (!candidates.length) return undefined;

  for (const candidate of candidates) {
    if (unmatchedRefs.includes(candidate)) return candidate;
  }

  const base = assetBasename(candidates[candidates.length - 1] ?? file.name);
  const basenameMatches = unmatchedRefs.filter((ref) => assetBasename(ref) === base);
  if (basenameMatches.length === 1) return basenameMatches[0];

  // Prefer a nested relative path from a folder drop when no unique ref match.
  return candidates.find((path) => path.includes("/")) ?? candidates[0];
}
