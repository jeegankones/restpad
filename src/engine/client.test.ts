import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixtureServer } from "../../test/server/fixtureServer";
import { executeRequest, type ExecuteOptions } from "./client";
import type { ResolvedRequest } from "../variables/resolver";

const server = new FixtureServer();
beforeAll(() => server.start());
afterAll(() => server.stop());

function request(overrides: Partial<ResolvedRequest>): ResolvedRequest {
  return {
    method: "GET",
    url: `${server.baseUrl}/json`,
    headers: [],
    directives: {},
    ...overrides,
  };
}

const defaults: ExecuteOptions = { timeoutMs: 5000, followRedirects: true };

describe("executeRequest", () => {
  it("performs a GET and returns status, headers, body, timing", async () => {
    const response = await executeRequest(request({}), defaults);
    expect(response.status).toBe(200);
    expect(response.statusText).toBe("OK");
    expect(JSON.parse(response.body.toString())).toEqual({ hello: "world" });
    expect(response.durationMs).toBeGreaterThan(0);
    expect(response.bodySize).toBe(17);
  });

  it("sends method, headers, and body", async () => {
    const response = await executeRequest(
      request({
        method: "POST",
        url: `${server.baseUrl}/echo`,
        headers: [
          { name: "Content-Type", value: "application/json" },
          { name: "X-Custom", value: "yes" },
        ],
        body: '{"a":1}',
      }),
      defaults,
    );
    const echo = JSON.parse(response.body.toString());
    expect(echo.method).toBe("POST");
    expect(echo.headers["content-type"]).toBe("application/json");
    expect(echo.headers["x-custom"]).toBe("yes");
    expect(echo.body).toBe('{"a":1}');
  });

  it("follows redirect chains", async () => {
    const response = await executeRequest(
      request({ url: `${server.baseUrl}/redirect/3` }),
      defaults,
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body.toString())).toEqual({ hello: "world" });
  });

  it("does not follow redirects when disabled", async () => {
    const response = await executeRequest(
      request({ url: `${server.baseUrl}/redirect/1` }),
      { ...defaults, followRedirects: false },
    );
    expect(response.status).toBe(302);
    expect(response.headers["location"]).toBe("/json");
  });

  it("honors the no-redirect directive over options", async () => {
    const response = await executeRequest(
      request({ url: `${server.baseUrl}/redirect/1`, directives: { "no-redirect": true } }),
      defaults,
    );
    expect(response.status).toBe(302);
  });

  it("converts POST to GET on 303", async () => {
    const response = await executeRequest(
      request({ method: "POST", url: `${server.baseUrl}/redirect-303`, body: "data" }),
      defaults,
    );
    const echo = JSON.parse(response.body.toString());
    expect(echo.method).toBe("GET");
    expect(echo.body).toBe("");
  });

  it("returns error statuses without throwing", async () => {
    const response = await executeRequest(
      request({ url: `${server.baseUrl}/status/503` }),
      defaults,
    );
    expect(response.status).toBe(503);
    expect(response.statusText).toBe("Service Unavailable");
  });

  it("rejects when the timeout elapses", async () => {
    await expect(
      executeRequest(request({ url: `${server.baseUrl}/slow/2000` }), {
        ...defaults,
        timeoutMs: 100,
      }),
    ).rejects.toThrow();
  });

  it("rejects when cancelled via signal", async () => {
    const abort = new AbortController();
    const pending = executeRequest(request({ url: `${server.baseUrl}/slow/2000` }), {
      ...defaults,
      signal: abort.signal,
    });
    setTimeout(() => abort.abort(), 50);
    await expect(pending).rejects.toThrow();
  });

  it("handles large responses", async () => {
    const response = await executeRequest(
      request({ url: `${server.baseUrl}/large/512` }),
      defaults,
    );
    expect(response.bodySize).toBe(512 * 1024);
  });

  it("prefixes bare hosts with http://", async () => {
    const response = await executeRequest(
      request({ url: server.baseUrl.replace("http://", "") + "/json" }),
      defaults,
    );
    expect(response.status).toBe(200);
  });
});
