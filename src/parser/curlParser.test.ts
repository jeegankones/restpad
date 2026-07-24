import { describe, expect, it } from "vitest";
import { parseCurl, tokenize } from "./curlParser";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("tokenize", () => {
  it("splits on unquoted whitespace", () => {
    expect(tokenize("curl -X POST url")).toEqual(["curl", "-X", "POST", "url"]);
  });

  it("keeps single-quoted content literal (no escapes)", () => {
    expect(tokenize(`curl -d '{"a":"b"}'`)).toEqual(["curl", "-d", '{"a":"b"}']);
    expect(tokenize(`-d 'a\\nb'`)).toEqual(["-d", "a\\nb"]);
  });

  it("preserves spaces inside quotes", () => {
    expect(tokenize(`-H 'A: b c'`)).toEqual(["-H", "A: b c"]);
    expect(tokenize(`-H "A: b c"`)).toEqual(["-H", "A: b c"]);
  });

  it("handles escaped quotes and backslashes in double quotes", () => {
    expect(tokenize(`-d "{\\"k\\":\\"v\\"}"`)).toEqual(["-d", '{"k":"v"}']);
    expect(tokenize(`"a\\\\b"`)).toEqual(["a\\b"]);
  });

  it("handles unquoted backslash escapes", () => {
    expect(tokenize(`a\\ b`)).toEqual(["a b"]);
  });

  it("joins backslash line continuations", () => {
    expect(tokenize("curl -X POST \\\n  url")).toEqual(["curl", "-X", "POST", "url"]);
    expect(tokenize("curl -X POST \\\r\n  url")).toEqual(["curl", "-X", "POST", "url"]);
  });

  it("preserves an empty quoted token", () => {
    expect(tokenize(`-d ''`)).toEqual(["-d", ""]);
  });
});

describe("parseCurl", () => {
  it("parses a bare URL as GET", () => {
    expect(parseCurl("curl https://example.com/comments/1")).toEqual({
      method: "GET",
      url: "https://example.com/comments/1",
      headers: [],
      body: undefined,
    });
  });

  it("honors -X / --request", () => {
    expect(parseCurl("curl -X DELETE https://x.test/1").method).toBe("DELETE");
    expect(parseCurl("curl --request PUT https://x.test/1").method).toBe("PUT");
  });

  it("supports an attached short method flag -XPOST", () => {
    expect(parseCurl("curl -XPOST https://x.test/1").method).toBe("POST");
  });

  it("lowercases nothing but uppercases the method", () => {
    expect(parseCurl("curl -X post https://x.test").method).toBe("POST");
  });

  it("parses -H / --header", () => {
    const r = parseCurl(
      `curl https://x.test -H "Content-Type: application/json" --header "X-A: 1"`,
    );
    expect(r.headers).toEqual([
      { name: "Content-Type", value: "application/json" },
      { name: "X-A", value: "1" },
    ]);
  });

  it("treats -d as POST when no -X is given", () => {
    const r = parseCurl(`curl https://x.test -d '{"name":"sample"}'`);
    expect(r.method).toBe("POST");
    expect(r.body).toBe('{"name":"sample"}');
  });

  it("keeps an explicit -X even with -d", () => {
    expect(parseCurl(`curl -X PATCH https://x.test -d 'a=1'`).method).toBe("PATCH");
  });

  it("joins repeated -d with &", () => {
    const r = parseCurl(`curl https://x.test -d 'a=1' -d 'b=2' --data-raw 'c=3'`);
    expect(r.body).toBe("a=1&b=2&c=3");
  });

  it("accepts --data, --data-ascii and --data-urlencode as data flags", () => {
    expect(parseCurl(`curl x --data 'a=1'`).body).toBe("a=1");
    expect(parseCurl(`curl x --data-ascii 'a=1'`).body).toBe("a=1");
    expect(parseCurl(`curl x --data-urlencode 'a=1'`).body).toBe("a=1");
  });

  it("emits Basic auth from -u / --user", () => {
    const r = parseCurl("curl -u user:passwd https://httpbin.org/basic-auth/user/passwd");
    expect(r.headers).toEqual([
      { name: "Authorization", value: `Basic ${b64("user:passwd")}` },
    ]);
    expect(r.url).toBe("https://httpbin.org/basic-auth/user/passwd");
  });

  it("keeps colons in the -u password", () => {
    const r = parseCurl("curl -u user:pa:ss https://x.test");
    expect(r.headers[0]!.value).toBe(`Basic ${b64("user:pa:ss")}`);
  });

  it("maps -I / --head to HEAD", () => {
    expect(parseCurl("curl -I https://x.test").method).toBe("HEAD");
    expect(parseCurl("curl --head https://x.test").method).toBe("HEAD");
  });

  it("parses a multiline command with continuations", () => {
    const r = parseCurl(
      [
        "curl -X POST https://example.com/comments \\",
        '  -H "Content-Type: application/json" \\',
        '  -H "Authorization: token xxx" \\',
        `  -d '{"name":"sample","time":"now"}'`,
      ].join("\n"),
    );
    expect(r).toEqual({
      method: "POST",
      url: "https://example.com/comments",
      headers: [
        { name: "Content-Type", value: "application/json" },
        { name: "Authorization", value: "token xxx" },
      ],
      body: '{"name":"sample","time":"now"}',
    });
  });

  it("handles a quoted URL with embedded query", () => {
    const r = parseCurl(`curl "https://x.test/s?q=a b&n=2"`);
    expect(r.url).toBe("https://x.test/s?q=a b&n=2");
  });

  it("preserves escaped quotes in a double-quoted JSON body", () => {
    const r = parseCurl(`curl -X POST https://x.test -d "{\\"k\\":\\"v\\"}"`);
    expect(r.body).toBe('{"k":"v"}');
  });

  it("ignores unrecognized flags", () => {
    const r = parseCurl("curl --compressed https://x.test");
    expect(r.url).toBe("https://x.test");
    expect(r.method).toBe("GET");
  });
});
