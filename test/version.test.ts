import { describe, expect, it } from "vitest";
import { MIN_WORLDAPI, olderThan } from "../src/version.js";

describe("olderThan", () => {
  it("compares x.y.z numerically", () => {
    expect(olderThan("1.1.1", "2.0.0")).toBe(true);
    expect(olderThan("2.0.0", "2.0.0")).toBe(false);
    expect(olderThan("2.10.0", "2.9.3")).toBe(false);
    expect(olderThan("2.0.0-beta.1", "2.0.1")).toBe(true);
  });

  it("expects the WorldAPI call_extension needs", () => {
    expect(MIN_WORLDAPI).toBe("4.6.0");
    expect(olderThan("4.5.9", MIN_WORLDAPI)).toBe(true);
  });

  it("lets dev builds through", () => {
    expect(olderThan("dev-1a2b3c4", "2.0.0")).toBe(false);
  });
});
