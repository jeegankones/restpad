import { describe, expect, it } from "vitest";
import { isFeatureEnabled, isProEnabled, OFFLINE_GRACE_MS, shouldRevalidate } from "./gate";
import { MockValidator, PolarValidator } from "./polarValidator";
import type { LicenseState } from "./types";

const NOW = 1_800_000_000_000;

function proState(overrides: Partial<Extract<LicenseState, { status: "pro" }>> = {}): LicenseState {
  return { status: "pro", key: "RP-TEST", validatedAt: NOW, ...overrides };
}

describe("license gate", () => {
  it("free state never enables Pro features", () => {
    expect(isProEnabled({ status: "free" }, NOW)).toBe(false);
    expect(isFeatureEnabled("graphql", { status: "free" }, NOW)).toBe(false);
  });

  it("recently validated pro state enables features", () => {
    expect(isProEnabled(proState(), NOW)).toBe(true);
    expect(isFeatureEnabled("streaming", proState(), NOW)).toBe(true);
  });

  it("fails open within the offline grace window", () => {
    const state = proState({ validatedAt: NOW - OFFLINE_GRACE_MS + 60_000 });
    expect(isProEnabled(state, NOW)).toBe(true);
  });

  it("fails closed once the grace window lapses", () => {
    const state = proState({ validatedAt: NOW - OFFLINE_GRACE_MS - 1 });
    expect(isProEnabled(state, NOW)).toBe(false);
  });

  it("fails closed on expiry regardless of recent validation", () => {
    const state = proState({ expiresAt: NOW - 1 });
    expect(isProEnabled(state, NOW)).toBe(false);
  });

  it("requests revalidation only after the revalidate interval", () => {
    expect(shouldRevalidate(proState(), NOW)).toBe(false);
    expect(shouldRevalidate(proState({ validatedAt: NOW - 25 * 60 * 60 * 1000 }), NOW)).toBe(true);
    expect(shouldRevalidate({ status: "free" }, NOW)).toBe(false);
  });
});

describe("PolarValidator", () => {
  function withResponse(status: number, body?: unknown): PolarValidator {
    const fetchImpl = (async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
      })) as typeof fetch;
    return new PolarValidator("org_test", "https://api.example.test/v1", fetchImpl);
  }

  it("accepts a granted key and parses expiry", async () => {
    const validator = withResponse(200, {
      status: "granted",
      expires_at: "2030-01-01T00:00:00Z",
    });
    const result = await validator.validate("RP-KEY");
    expect(result.valid).toBe(true);
    expect(result.expiresAt).toBe(Date.parse("2030-01-01T00:00:00Z"));
  });

  it("rejects unknown keys without throwing", async () => {
    const result = await withResponse(404).validate("RP-BAD");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });

  it("rejects revoked keys with the backend status", async () => {
    const result = await withResponse(200, { status: "revoked" }).validate("RP-REVOKED");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/revoked/);
  });

  it("throws on 5xx so callers keep prior state (offline grace)", async () => {
    await expect(withResponse(503).validate("RP-KEY")).rejects.toThrow(/unavailable/);
  });

  it("MockValidator returns its configured result", async () => {
    await expect(new MockValidator({ valid: true }).validate()).resolves.toEqual({ valid: true });
  });
});
