import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixtureServer } from "../../test/server/fixtureServer";
import { CookieJar } from "./cookieJar";
import { executeRequest, type ExecuteOptions } from "./client";
import type { ResolvedRequest } from "../variables/resolver";

const NOW = 1_800_000_000_000;

describe("CookieJar", () => {
  it("stores cookies and returns them for matching requests", () => {
    const jar = new CookieJar();
    jar.storeFromResponse("https://api.example.com/login", ["session=abc; Path=/"], NOW);
    expect(jar.cookieHeader("https://api.example.com/users", NOW)).toBe("session=abc");
  });

  it("scopes cookies to their path", () => {
    const jar = new CookieJar();
    jar.storeFromResponse("https://example.com/", ["scoped=1; Path=/admin"], NOW);
    expect(jar.cookieHeader("https://example.com/admin/panel", NOW)).toBe("scoped=1");
    expect(jar.cookieHeader("https://example.com/public", NOW)).toBeUndefined();
    expect(jar.cookieHeader("https://example.com/administrator", NOW)).toBeUndefined();
  });

  it("host-only cookies do not leak to subdomains, Domain cookies do", () => {
    const jar = new CookieJar();
    jar.storeFromResponse("https://example.com/", ["hostonly=1"], NOW);
    jar.storeFromResponse("https://example.com/", ["wide=1; Domain=example.com"], NOW);
    expect(jar.cookieHeader("https://sub.example.com/", NOW)).toBe("wide=1");
    expect(jar.cookieHeader("https://example.com/", NOW)).toContain("hostonly=1");
  });

  it("rejects cookies claiming an unrelated domain", () => {
    const jar = new CookieJar();
    jar.storeFromResponse("https://evil.test/", ["stolen=1; Domain=example.com"], NOW);
    expect(jar.cookieHeader("https://example.com/", NOW)).toBeUndefined();
  });

  it("honors Max-Age over Expires and expires cookies", () => {
    const jar = new CookieJar();
    jar.storeFromResponse(
      "https://example.com/",
      ["short=1; Max-Age=60; Expires=Wed, 01 Jan 2031 00:00:00 GMT"],
      NOW,
    );
    expect(jar.cookieHeader("https://example.com/", NOW + 59_000)).toBe("short=1");
    expect(jar.cookieHeader("https://example.com/", NOW + 61_000)).toBeUndefined();
  });

  it("treats Max-Age=0 as deletion", () => {
    const jar = new CookieJar();
    jar.storeFromResponse("https://example.com/", ["session=abc; Path=/"], NOW);
    jar.storeFromResponse("https://example.com/", ["session=gone; Path=/; Max-Age=0"], NOW);
    expect(jar.cookieHeader("https://example.com/", NOW)).toBeUndefined();
  });

  it("withholds Secure cookies from http requests", () => {
    const jar = new CookieJar();
    jar.storeFromResponse("https://example.com/", ["s=1; Secure"], NOW);
    expect(jar.cookieHeader("http://example.com/", NOW)).toBeUndefined();
    expect(jar.cookieHeader("https://example.com/", NOW)).toBe("s=1");
  });
});

describe("engine cookie integration", () => {
  const server = new FixtureServer();
  beforeAll(() => server.start());
  afterAll(() => server.stop());

  function request(url: string, overrides: Partial<ResolvedRequest> = {}): ResolvedRequest {
    return { method: "GET", url, headers: [], directives: {}, ...overrides };
  }

  function options(jar: CookieJar): ExecuteOptions {
    return { timeoutMs: 5000, followRedirects: true, cookieJar: jar };
  }

  it("round-trips cookies across sequential requests", async () => {
    const jar = new CookieJar();
    await executeRequest(request(`${server.baseUrl}/set-cookie?session=xyz`), options(jar));
    const echo = await executeRequest(request(`${server.baseUrl}/cookies`), options(jar));
    expect(JSON.parse(echo.body.toString()).cookie).toBe("session=xyz");
  });

  it("applies cookies set during a redirect to the followed hop", async () => {
    const jar = new CookieJar();
    const echo = await executeRequest(
      request(`${server.baseUrl}/set-cookie-redirect`),
      options(jar),
    );
    expect(JSON.parse(echo.body.toString()).cookie).toBe("hop=1");
  });

  it("bypasses the jar under # @no-cookie-jar", async () => {
    const jar = new CookieJar();
    await executeRequest(request(`${server.baseUrl}/set-cookie?a=1`), options(jar));
    const echo = await executeRequest(
      request(`${server.baseUrl}/cookies`, { directives: { "no-cookie-jar": true } }),
      options(jar),
    );
    expect(JSON.parse(echo.body.toString()).cookie).toBeNull();
  });

  it("prefers an explicit Cookie header over the jar", async () => {
    const jar = new CookieJar();
    await executeRequest(request(`${server.baseUrl}/set-cookie?a=1`), options(jar));
    const echo = await executeRequest(
      request(`${server.baseUrl}/cookies`, {
        headers: [{ name: "Cookie", value: "manual=override" }],
      }),
      options(jar),
    );
    expect(JSON.parse(echo.body.toString()).cookie).toBe("manual=override");
  });
});
