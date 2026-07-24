import { describe, expect, it } from "vitest";
import { parseHttpFile, requestAtLine } from "./httpParser";

describe("parseHttpFile", () => {
  it("parses a bare URL as GET", () => {
    const file = parseHttpFile("https://example.com/api/users");
    expect(file.requests).toHaveLength(1);
    expect(file.requests[0]).toMatchObject({
      method: "GET",
      url: "https://example.com/api/users",
    });
  });

  it("parses method, http version, and headers", () => {
    const file = parseHttpFile(
      [
        "POST https://example.com/api/users HTTP/1.1",
        "Content-Type: application/json",
        "Authorization: Bearer abc123",
      ].join("\n"),
    );
    const request = file.requests[0]!;
    expect(request.method).toBe("POST");
    expect(request.httpVersion).toBe("HTTP/1.1");
    expect(request.headers).toEqual([
      { name: "Content-Type", value: "application/json" },
      { name: "Authorization", value: "Bearer abc123" },
    ]);
  });

  it("parses a JSON body after the blank line", () => {
    const file = parseHttpFile(
      [
        "POST https://example.com/api/users",
        "Content-Type: application/json",
        "",
        "{",
        '  "name": "Ada"',
        "}",
      ].join("\n"),
    );
    expect(file.requests[0]!.body).toBe('{\n  "name": "Ada"\n}');
  });

  it("splits multiple requests on ### separators", () => {
    const file = parseHttpFile(
      [
        "GET https://example.com/one",
        "",
        "### second request",
        "GET https://example.com/two",
        "",
        "###",
        "DELETE https://example.com/three",
      ].join("\n"),
    );
    expect(file.requests.map((r) => r.url)).toEqual([
      "https://example.com/one",
      "https://example.com/two",
      "https://example.com/three",
    ]);
    expect(file.requests[2]!.method).toBe("DELETE");
  });

  it("collects file variables and leaves {{refs}} untouched", () => {
    const file = parseHttpFile(
      [
        "@baseUrl = https://example.com",
        "@token = abc",
        "",
        "GET {{baseUrl}}/users",
        "Authorization: Bearer {{token}}",
      ].join("\n"),
    );
    expect(file.variables).toEqual([
      { name: "baseUrl", value: "https://example.com", line: 0 },
      { name: "token", value: "abc", line: 1 },
    ]);
    expect(file.requests[0]!.url).toBe("{{baseUrl}}/users");
  });

  it("captures @name and directives from comments", () => {
    const file = parseHttpFile(
      [
        "# @name login",
        "// @no-redirect",
        "POST https://example.com/login",
      ].join("\n"),
    );
    const request = file.requests[0]!;
    expect(request.name).toBe("login");
    expect(request.directives["no-redirect"]).toBe(true);
  });

  it("ignores comment lines but not separators", () => {
    const file = parseHttpFile(
      [
        "# a comment",
        "// another comment",
        "GET https://example.com/a",
        "",
        "### next",
        "GET https://example.com/b",
      ].join("\n"),
    );
    expect(file.requests).toHaveLength(2);
  });

  it("appends indented query continuation lines to the URL", () => {
    const file = parseHttpFile(
      [
        "GET https://example.com/search",
        "    ?q=test",
        "    &page=2",
        "Accept: application/json",
      ].join("\n"),
    );
    const request = file.requests[0]!;
    expect(request.url).toBe("https://example.com/search?q=test&page=2");
    expect(request.headers).toEqual([{ name: "Accept", value: "application/json" }]);
  });

  it("parses body file references", () => {
    const file = parseHttpFile(
      ["POST https://example.com/upload", "", "< ./payload.json"].join("\n"),
    );
    expect(file.requests[0]!.bodyFile).toEqual({
      path: "./payload.json",
      processVariables: false,
    });

    const processed = parseHttpFile(
      ["POST https://example.com/upload", "", "<@ ./payload.json"].join("\n"),
    );
    expect(processed.requests[0]!.bodyFile!.processVariables).toBe(true);
  });

  it("handles variable-only blocks without producing a request", () => {
    const file = parseHttpFile(
      ["@baseUrl = https://example.com", "", "###", "GET {{baseUrl}}/a"].join("\n"),
    );
    expect(file.requests).toHaveLength(1);
    expect(file.variables).toHaveLength(1);
  });

  it("handles CRLF line endings", () => {
    const file = parseHttpFile(
      "POST https://example.com\r\nContent-Type: application/json\r\n\r\n{\"a\":1}",
    );
    const request = file.requests[0]!;
    expect(request.method).toBe("POST");
    expect(request.body).toBe('{"a":1}');
  });

  it("finds the request at a given line", () => {
    const file = parseHttpFile(
      ["GET https://example.com/a", "", "###", "GET https://example.com/b"].join("\n"),
    );
    expect(requestAtLine(file, 0)!.url).toBe("https://example.com/a");
    expect(requestAtLine(file, 3)!.url).toBe("https://example.com/b");
  });

  it("returns no requests for an empty file", () => {
    expect(parseHttpFile("").requests).toHaveLength(0);
    expect(parseHttpFile("# just a comment").requests).toHaveLength(0);
  });
});
