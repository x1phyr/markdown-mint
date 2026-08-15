import type { Locale } from "./export-types";

export function parseLocale(value: unknown): Locale | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "en" || candidate === "zh-CN" ? candidate : undefined;
}

export function localizedHref(
  baseURL: string,
  path: string,
  locale: Locale,
  query: Readonly<Record<string, string>> = {},
): string {
  const normalizedBase = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
  const normalizedPath = path.replace(/^\/+|\/+$/gu, "");
  const href = normalizedPath ? `${normalizedBase}${normalizedPath}` : normalizedBase;
  const params = new URLSearchParams({ ...query, lang: locale });
  return `${href}?${params.toString()}`;
}
