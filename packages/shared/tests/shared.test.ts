import { describe, expect, it } from "vitest";

import { assertNever } from "../src/index.js";

describe("assertNever", () => {
  it("fails loudly for an unexpected runtime value", () => {
    expect(() => assertNever("unexpected" as never)).toThrow("Unexpected value: unexpected");
  });
});
