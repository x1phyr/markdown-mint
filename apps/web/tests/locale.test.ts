import { describe, expect, it } from "vitest";

import { localizedHref, parseLocale } from "../app/utils/locale";

describe("locale navigation", () => {
  it("accepts only supported route locales", () => {
    expect(parseLocale("zh-CN")).toBe("zh-CN");
    expect(parseLocale(["en", "zh-CN"])).toBe("en");
    expect(parseLocale("fr")).toBeUndefined();
  });

  it("keeps the locale across base paths and other query parameters", () => {
    expect(localizedHref("/", "themes/technical-mint", "zh-CN")).toBe(
      "/themes/technical-mint?lang=zh-CN",
    );
    expect(localizedHref("/markdown-mint", "", "en", { theme: "technical-mint" })).toBe(
      "/markdown-mint/?theme=technical-mint&lang=en",
    );
  });
});
