import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixtureServer } from "../../test/server/fixtureServer";
import { executeRequest } from "../engine/client";
import { parseHttpFile } from "../parser/httpParser";
import { ResponseStore } from "../variables/responseStore";
import { runAll } from "./runAll";

const server = new FixtureServer();
beforeAll(() => server.start());
afterAll(() => server.stop());

const options = { timeoutMs: 5000, followRedirects: true };

describe("runAll", () => {
  it("runs every request in order and reports progress", async () => {
    const file = parseHttpFile(
      [
        `GET ${server.baseUrl}/json`,
        "###",
        `GET ${server.baseUrl}/status/204`,
        "###",
        `GET ${server.baseUrl}/status/404`,
      ].join("\n"),
    );
    const progress: number[] = [];
    const results = await runAll(
      file,
      { fileVariables: file.variables, environmentVariables: {} },
      executeRequest,
      options,
      (completed) => progress.push(completed),
    );
    expect(results.map((r) => r.response?.status)).toEqual([200, 204, 404]);
    expect(progress).toEqual([1, 2, 3]);
  });

  it("makes earlier named responses available to later requests", async () => {
    const file = parseHttpFile(
      [
        "# @name first",
        `GET ${server.baseUrl}/json`,
        "###",
        `POST ${server.baseUrl}/echo`,
        "Content-Type: application/json",
        "",
        '{"greeting": "{{first.response.body.$.hello}}"}',
      ].join("\n"),
    );
    const responses = new ResponseStore();
    const results = await runAll(
      file,
      { fileVariables: file.variables, environmentVariables: {}, responses },
      executeRequest,
      options,
    );
    const echoed = JSON.parse(results[1]!.response!.body.toString());
    expect(JSON.parse(echoed.body).greeting).toBe("world");
  });

  it("records failures and continues", async () => {
    const file = parseHttpFile(
      [
        "GET http://127.0.0.1:1/unreachable",
        "###",
        `GET ${server.baseUrl}/json`,
      ].join("\n"),
    );
    const results = await runAll(
      file,
      { fileVariables: file.variables, environmentVariables: {} },
      executeRequest,
      options,
    );
    expect(results).toHaveLength(2);
    expect(results[0]!.error).toBeInstanceOf(Error);
    expect(results[1]!.response!.status).toBe(200);
  });

  it("stops when the signal aborts", async () => {
    const abort = new AbortController();
    const file = parseHttpFile(
      [
        `GET ${server.baseUrl}/slow/2000`,
        "###",
        `GET ${server.baseUrl}/json`,
      ].join("\n"),
    );
    const pending = runAll(
      file,
      { fileVariables: file.variables, environmentVariables: {} },
      executeRequest,
      { ...options, signal: abort.signal },
    );
    setTimeout(() => abort.abort(), 50);
    const results = await pending;
    expect(results).toHaveLength(0);
  });
});
