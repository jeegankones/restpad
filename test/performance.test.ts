import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { parseHttpFile } from "../src/parser/httpParser";

/**
 * Performance budgets from TESTING.md. Parsing runs on every keystroke via
 * CodeLens, so it must stay fast on pathological files. Budgets are generous
 * enough for slow CI runners; the point is catching accidental O(n²) rather
 * than micro-benchmarking.
 */

function generateFile(requestCount: number): string {
  const blocks: string[] = ["@baseUrl = https://example.com", ""];
  for (let i = 0; i < requestCount; i++) {
    blocks.push(
      `### request ${i}`,
      `# @name req${i}`,
      `POST {{baseUrl}}/items/${i}?page=${i}`,
      "Content-Type: application/json",
      "Authorization: Bearer {{token}}",
      "",
      `{ "index": ${i}, "payload": "${"x".repeat(100)}" }`,
      "",
    );
  }
  return blocks.join("\n");
}

describe("parser performance budgets", () => {
  it("parses a 1,000-request file in under 100ms", () => {
    const text = generateFile(1000);
    parseHttpFile(text); // warm-up (JIT)
    const start = performance.now();
    const file = parseHttpFile(text);
    const elapsed = performance.now() - start;
    expect(file.requests).toHaveLength(1000);
    expect(elapsed).toBeLessThan(100);
  });

  it("scales roughly linearly (10k requests under 20x the 1k budget)", () => {
    const text = generateFile(10_000);
    const start = performance.now();
    const file = parseHttpFile(text);
    const elapsed = performance.now() - start;
    expect(file.requests).toHaveLength(10_000);
    expect(elapsed).toBeLessThan(2000);
  });

  it("handles a single pathological 5MB body without blowing up", () => {
    const text = `POST https://example.com/upload\nContent-Type: text/plain\n\n${"y".repeat(5 * 1024 * 1024)}`;
    const start = performance.now();
    const file = parseHttpFile(text);
    const elapsed = performance.now() - start;
    expect(file.requests).toHaveLength(1);
    expect(file.requests[0]!.body!.length).toBe(5 * 1024 * 1024);
    expect(elapsed).toBeLessThan(500);
  });
});
