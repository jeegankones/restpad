import { describe, expect, it } from "vitest";
import { resolveText, type ResolveContext } from "./resolver";

function ctx(overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    fileVariables: [{ name: "host", value: "file.example.com", line: 0 }],
    environmentVariables: { host: "env.example.com", token: "env-token" },
    ...overrides,
  };
}

describe("resolveText", () => {
  it("file variables shadow environment variables", () => {
    expect(resolveText("https://{{host}}/x", ctx())).toBe("https://file.example.com/x");
  });

  it("falls back to environment variables", () => {
    expect(resolveText("Bearer {{token}}", ctx())).toBe("Bearer env-token");
  });

  it("leaves unresolvable references in place", () => {
    expect(resolveText("{{missing}}", ctx())).toBe("{{missing}}");
  });

  it("resolves nested variable references", () => {
    const nested = ctx({
      fileVariables: [
        { name: "base", value: "https://{{host}}", line: 0 },
        { name: "host", value: "nested.example.com", line: 1 },
      ],
    });
    expect(resolveText("{{base}}/x", nested)).toBe("https://nested.example.com/x");
  });

  it("uses the last definition when a file variable is redefined", () => {
    const redefined = ctx({
      fileVariables: [
        { name: "host", value: "first.example.com", line: 0 },
        { name: "host", value: "second.example.com", line: 5 },
      ],
    });
    expect(resolveText("{{host}}", redefined)).toBe("second.example.com");
  });

  it("resolves $guid, $timestamp, and $randomInt", () => {
    expect(resolveText("{{$guid}}", ctx())).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(Number(resolveText("{{$timestamp}}", ctx()))).toBeGreaterThan(1_500_000_000);
    const randomInt = Number(resolveText("{{$randomInt 5 10}}", ctx()));
    expect(randomInt).toBeGreaterThanOrEqual(5);
    expect(randomInt).toBeLessThan(10);
  });

  it("resolves $processEnv from the provided process environment", () => {
    const withEnv = ctx({ processEnv: { API_KEY: "secret123" } });
    expect(resolveText("{{$processEnv API_KEY}}", withEnv)).toBe("secret123");
    expect(resolveText("{{$processEnv MISSING_VAR_XYZ}}", withEnv)).toBe(
      "{{$processEnv MISSING_VAR_XYZ}}",
    );
  });

  it("resolves $dotenv from provided dotenv variables", () => {
    const withDotenv = ctx({ dotenvVariables: { DB_URL: "postgres://x" } });
    expect(resolveText("{{$dotenv DB_URL}}", withDotenv)).toBe("postgres://x");
    expect(resolveText("{{$dotenv NOPE}}", withDotenv)).toBe("{{$dotenv NOPE}}");
  });

  it("resolves $datetime iso8601 and rfc1123", () => {
    expect(resolveText("{{$datetime iso8601}}", ctx())).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(resolveText("{{$datetime rfc1123}}", ctx())).toMatch(/GMT$/);
  });
});
