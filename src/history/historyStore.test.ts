import { describe, expect, it } from "vitest";
import type { ResponseData } from "../engine/client";
import type { ResolvedRequest } from "../variables/resolver";
import { HistoryStore } from "./historyStore";

function entry(url: string): [ResolvedRequest, ResponseData] {
  return [
    { method: "GET", url, headers: [], directives: {} },
    {
      status: 200,
      statusText: "OK",
      headers: {},
      body: Buffer.from("{}"),
      durationMs: 1,
      bodySize: 2,
    },
  ];
}

describe("HistoryStore", () => {
  it("returns entries newest first", () => {
    const store = new HistoryStore();
    store.push(...entry("https://a.test"), 1);
    store.push(...entry("https://b.test"), 2);
    expect(store.list().map((e) => e.request.url)).toEqual([
      "https://b.test",
      "https://a.test",
    ]);
    expect(store.latest()!.request.url).toBe("https://b.test");
  });

  it("caps at capacity, dropping the oldest", () => {
    const store = new HistoryStore(3);
    for (let i = 0; i < 5; i++) store.push(...entry(`https://x.test/${i}`));
    expect(store.list()).toHaveLength(3);
    expect(store.list()[0]!.request.url).toBe("https://x.test/4");
    expect(store.list()[2]!.request.url).toBe("https://x.test/2");
  });

  it("clears", () => {
    const store = new HistoryStore();
    store.push(...entry("https://a.test"));
    store.clear();
    expect(store.list()).toHaveLength(0);
    expect(store.latest()).toBeUndefined();
  });
});
