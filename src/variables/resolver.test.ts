import { describe, expect, it } from "vitest";
import type { ResponseData } from "../engine/client";
import { resolveText, type ResolveContext, type ResolvedRequest } from "./resolver";
import { ResponseStore } from "./responseStore";

function ctx(overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    fileVariables: [{ name: "host", value: "file.example.com", line: 0 }],
    environmentVariables: { host: "env.example.com", token: "env-token" },
    ...overrides,
  };
}

function response(
  body: string,
  headers: Record<string, string | string[]> = {},
): ResponseData {
  const buffer = Buffer.from(body, "utf8");
  return {
    status: 200,
    statusText: "OK",
    headers,
    body: buffer,
    durationMs: 1,
    bodySize: buffer.byteLength,
  };
}

function request(overrides: Partial<ResolvedRequest> = {}): ResolvedRequest {
  return {
    method: "POST",
    url: "http://example.com/login",
    headers: [],
    body: undefined,
    directives: {},
    ...overrides,
  };
}

/** A store with a single "login" entry, plus any extra entries. */
function storeWith(
  responseBody: string,
  responseHeaders: Record<string, string | string[]> = {},
  req: ResolvedRequest = request(),
): ResponseStore {
  const store = new ResponseStore();
  store.save("login", { request: req, response: response(responseBody, responseHeaders) });
  return store;
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

describe("request variables", () => {
  it("resolves a top-level response body JSONPath", () => {
    const responses = storeWith('{"token":"abc123"}');
    expect(resolveText("Bearer {{login.response.body.$.token}}", ctx({ responses }))).toBe(
      "Bearer abc123",
    );
  });

  it("resolves nested object paths", () => {
    const responses = storeWith('{"data":{"user":{"id":42}}}');
    expect(resolveText("{{login.response.body.$.data.user.id}}", ctx({ responses }))).toBe(
      "42",
    );
  });

  it("resolves array indices", () => {
    const responses = storeWith('{"items":[{"id":10},{"id":20}]}');
    expect(resolveText("{{login.response.body.$.items[0].id}}", ctx({ responses }))).toBe(
      "10",
    );
    expect(resolveText("{{login.response.body.$.items[1].id}}", ctx({ responses }))).toBe(
      "20",
    );
  });

  it("resolves a root array index", () => {
    const responses = storeWith('["a","b","c"]');
    expect(resolveText("{{login.response.body.$[2]}}", ctx({ responses }))).toBe("c");
  });

  it("resolves bracketed string keys", () => {
    const responses = storeWith('{"a-b":"dash"}');
    expect(resolveText('{{login.response.body.$["a-b"]}}', ctx({ responses }))).toBe("dash");
  });

  it("stringifies object and array values as JSON", () => {
    const responses = storeWith('{"obj":{"x":1},"arr":[1,2]}');
    expect(resolveText("{{login.response.body.$.obj}}", ctx({ responses }))).toBe('{"x":1}');
    expect(resolveText("{{login.response.body.$.arr}}", ctx({ responses }))).toBe("[1,2]");
  });

  it("returns the full body for body.*", () => {
    const responses = storeWith("plain text body");
    expect(resolveText("{{login.response.body.*}}", ctx({ responses }))).toBe(
      "plain text body",
    );
  });

  it("leaves missing JSON paths in place", () => {
    const responses = storeWith('{"token":"abc"}');
    expect(resolveText("{{login.response.body.$.missing}}", ctx({ responses }))).toBe(
      "{{login.response.body.$.missing}}",
    );
    expect(resolveText("{{login.response.body.$.token.deeper}}", ctx({ responses }))).toBe(
      "{{login.response.body.$.token.deeper}}",
    );
    expect(resolveText("{{login.response.body.$.items[5]}}", ctx({ responses }))).toBe(
      "{{login.response.body.$.items[5]}}",
    );
  });

  it("leaves body.$ paths on non-JSON bodies in place", () => {
    const responses = storeWith("hello world, not json");
    expect(resolveText("{{login.response.body.$.token}}", ctx({ responses }))).toBe(
      "{{login.response.body.$.token}}",
    );
  });

  it("does not resolve XPath expressions", () => {
    const responses = storeWith('{"a":1}');
    expect(resolveText("{{login.response.body.//reply[1]/@id}}", ctx({ responses }))).toBe(
      "{{login.response.body.//reply[1]/@id}}",
    );
  });

  it("leaves references to unknown request names in place", () => {
    const responses = storeWith('{"token":"abc"}');
    expect(resolveText("{{other.response.body.$.token}}", ctx({ responses }))).toBe(
      "{{other.response.body.$.token}}",
    );
  });

  it("leaves references in place when no store is provided", () => {
    expect(resolveText("{{login.response.body.$.token}}", ctx())).toBe(
      "{{login.response.body.$.token}}",
    );
  });

  it("resolves response headers case-insensitively", () => {
    const responses = storeWith("{}", { "x-authtoken": "tok-99" });
    expect(resolveText("{{login.response.headers.X-AuthToken}}", ctx({ responses }))).toBe(
      "tok-99",
    );
    expect(resolveText("{{login.response.headers.x-authtoken}}", ctx({ responses }))).toBe(
      "tok-99",
    );
  });

  it("joins multi-valued response headers", () => {
    const responses = storeWith("{}", { "set-cookie": ["a=1", "b=2"] });
    expect(resolveText("{{login.response.headers.Set-Cookie}}", ctx({ responses }))).toBe(
      "a=1, b=2",
    );
  });

  it("leaves missing response headers in place", () => {
    const responses = storeWith("{}", { "content-type": "application/json" });
    expect(resolveText("{{login.response.headers.Missing}}", ctx({ responses }))).toBe(
      "{{login.response.headers.Missing}}",
    );
  });

  it("resolves request headers case-insensitively", () => {
    const responses = storeWith("{}", {}, request({
      headers: [{ name: "Content-Type", value: "application/json" }],
    }));
    expect(resolveText("{{login.request.headers.content-type}}", ctx({ responses }))).toBe(
      "application/json",
    );
  });

  it("resolves the request body via .* and JSONPath", () => {
    const responses = storeWith("{}", {}, request({ body: '{"email":"a@b.com"}' }));
    expect(resolveText("{{login.request.body.*}}", ctx({ responses }))).toBe(
      '{"email":"a@b.com"}',
    );
    expect(resolveText("{{login.request.body.$.email}}", ctx({ responses }))).toBe("a@b.com");
  });

  it("leaves request.body references in place when the request had no body", () => {
    const responses = storeWith("{}", {}, request({ body: undefined }));
    expect(resolveText("{{login.request.body.*}}", ctx({ responses }))).toBe(
      "{{login.request.body.*}}",
    );
  });

  it("chains through file variables to a stored response", () => {
    const responses = storeWith('{"token":"chained"}');
    const chained = ctx({
      responses,
      fileVariables: [
        { name: "authToken", value: "{{login.response.body.$.token}}", line: 0 },
      ],
    });
    expect(resolveText("Authorization: {{authToken}}", chained)).toBe(
      "Authorization: chained",
    );
  });
});
