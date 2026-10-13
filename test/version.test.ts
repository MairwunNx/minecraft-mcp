import { describe, expect, it } from "vitest";
import { olderThan } from "../src/version.js";

describe("olderThan", () => {
  it("compares x.y.z numerically", () => {
    expect(olderThan("1.1.1", "2.0.0")).toBe(true);
    expect(olderThan("2.0.0", "2.0.0")).toBe(false);
    expect(olderThan("2.10.0", "2.9.3")).toBe(false);
    expect(olderThan("2.0.0-beta.1", "2.0.1")).toBe(true);
  });

  it("lets dev builds through", () => {
    expect(olderThan("dev-1a2b3c4", "2.0.0")).toBe(false);
  });
});
