import { describe, expect, it } from "vitest";
import { fromLoopback } from "../src/http.js";

describe("loopback HTTP without a token", () => {
  it("lets in this machine's clients", () => {
    expect(fromLoopback("127.0.0.1:3333", undefined)).toBe(true);
    expect(fromLoopback("localhost:3333", "http://localhost:6274")).toBe(true);
    expect(fromLoopback("[::1]:3333", "http://[::1]:5173")).toBe(true);
  });

  it("refuses a page that rebound its domain to the loopback", () => {
    expect(fromLoopback("evil.example:3333", undefined)).toBe(false);
    expect(fromLoopback("127.0.0.1:3333", "https://evil.example")).toBe(false);
    expect(fromLoopback("localhost.evil.example:3333", undefined)).toBe(false);
    expect(fromLoopback(undefined, undefined)).toBe(false);
    expect(fromLoopback("127.0.0.1:3333", "null")).toBe(false);
  });
});
