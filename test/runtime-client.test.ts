import { describe, expect, it } from "vitest";
import { createWorldApi, TIMEOUT_MESSAGE, unwrap, WorldApiError } from "../src/client.js";

/** A server that never answers, but lets go when the request's signal aborts. */
const hung: typeof fetch = (input) =>
  new Promise((_, reject) => {
    const signal = (input as Request).signal;
    signal.addEventListener("abort", () => reject(signal.reason));
  });

describe("a WorldAPI that doesn't answer", () => {
  it("fails the call with a timeout instead of hanging", async () => {
    const api = createWorldApi({ url: "http://127.0.0.1:1/api/v1", token: "t", readOnly: false }, hung, 50);
    const error = await unwrap(api.GET("/server")).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WorldApiError);
    expect((error as WorldApiError).code).toBe("timeout");
    expect((error as WorldApiError).message).toBe(TIMEOUT_MESSAGE);
  });

  it("still honours the caller's own signal", async () => {
    const api = createWorldApi({ url: "http://127.0.0.1:1/api/v1", token: "t", readOnly: false }, hung, 60_000);
    const controller = new AbortController();
    const call = unwrap(api.GET("/server", { signal: controller.signal }));
    controller.abort();
    await expect(call).rejects.toMatchObject({ code: "unreachable" });
  });
});
