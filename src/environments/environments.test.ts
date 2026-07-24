import { describe, expect, it } from "vitest";
import { parseDotenv } from "./dotenv";
import { environmentNames, mergeEnvironment } from "./merge";

describe("mergeEnvironment", () => {
  const config = {
    $shared: { host: "shared.example.com", token: "shared-token" },
    local: { host: "localhost:3000" },
    production: { host: "api.example.com", token: "prod-token" },
  };

  it("returns only $shared when no environment is active", () => {
    expect(mergeEnvironment(config, undefined)).toEqual({
      host: "shared.example.com",
      token: "shared-token",
    });
  });

  it("lets the active environment shadow $shared", () => {
    expect(mergeEnvironment(config, "local")).toEqual({
      host: "localhost:3000",
      token: "shared-token",
    });
    expect(mergeEnvironment(config, "production")).toEqual({
      host: "api.example.com",
      token: "prod-token",
    });
  });

  it("tolerates unknown active environments and empty config", () => {
    expect(mergeEnvironment(config, "missing")).toEqual(config.$shared);
    expect(mergeEnvironment({}, "local")).toEqual({});
  });

  it("lists switchable environments without $shared", () => {
    expect(environmentNames(config)).toEqual(["local", "production"]);
    expect(environmentNames({})).toEqual([]);
  });
});

describe("parseDotenv", () => {
  it("parses plain, quoted, and exported values", () => {
    const parsed = parseDotenv(
      [
        "# comment",
        "PLAIN=hello",
        "export EXPORTED=yes",
        'DOUBLE="line1\\nline2"',
        "SINGLE='literal\\n'",
        "TRAILING=value # inline comment",
        "EMPTY=",
        "not a valid line",
      ].join("\n"),
    );
    expect(parsed).toEqual({
      PLAIN: "hello",
      EXPORTED: "yes",
      DOUBLE: "line1\nline2",
      SINGLE: "literal\\n",
      TRAILING: "value",
      EMPTY: "",
    });
  });

  it("returns an empty object for empty input", () => {
    expect(parseDotenv("")).toEqual({});
  });
});
