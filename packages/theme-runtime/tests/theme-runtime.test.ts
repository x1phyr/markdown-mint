import { describe, expect, it } from "vitest";

import { combineThemeCss } from "../src/index.js";

describe("combineThemeCss", () => {
  it("combines theme layers in contract order", () => {
    expect(
      combineThemeCss({
        contentCss: "content",
        printCss: "print",
        screenCss: "screen",
        tokensCss: "tokens",
      }),
    ).toBe("tokens\ncontent\nscreen\nprint");
  });
});
