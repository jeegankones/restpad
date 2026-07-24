import { describe, expect, it } from "vitest";
import type { ResponseData } from "../engine/client";
import type { ResolvedRequest } from "./resolver";
import { ResponseStore, type StoredResponse } from "./responseStore";

function response(body: string, overrides: Partial<ResponseData> = {}): ResponseData {
  const buffer = Buffer.from(body, "utf8");
  return {
    status: 200,
    statusText: "OK",
    headers: {},
    body: buffer,
    durationMs: 1,
    bodySize: buffer.byteLength,
    ...overrides,
  };
}

function request(overrides: Partial<ResolvedRequest> = {}): ResolvedRequest {
  return {
    method: "GET",
    url: "http://example.com",
    headers: [],
    body: undefined,
    directives: {},
    ...overrides,
  };
}

function entry(body = "{}"): StoredResponse {
  return { request: request(), response: response(body) };
}

describe("ResponseStore", () => {
  it("returns undefined for unknown names", () => {
    const store = new ResponseStore();
    expect(store.get("nope")).toBeUndefined();
    expect(store.has("nope")).toBe(false);
  });

  it("saves and retrieves an entry by name", () => {
    const store = new ResponseStore();
    const saved = entry('{"token":"abc"}');
    store.save("login", saved);
    expect(store.has("login")).toBe(true);
    expect(store.get("login")).toBe(saved);
  });

  it("overwrites earlier executions of the same name (most recent wins)", () => {
    const store = new ResponseStore();
    store.save("login", entry('{"n":1}'));
    const latest = entry('{"n":2}');
    store.save("login", latest);
    expect(store.get("login")).toBe(latest);
    expect(store.get("login")!.response.body.toString("utf8")).toBe('{"n":2}');
  });

  it("keeps distinct names separate", () => {
    const store = new ResponseStore();
    const a = entry('{"a":1}');
    const b = entry('{"b":2}');
    store.save("a", a);
    store.save("b", b);
    expect(store.get("a")).toBe(a);
    expect(store.get("b")).toBe(b);
  });

  it("clears all entries", () => {
    const store = new ResponseStore();
    store.save("login", entry());
    store.clear();
    expect(store.has("login")).toBe(false);
    expect(store.get("login")).toBeUndefined();
  });
});
