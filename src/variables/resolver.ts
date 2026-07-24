import { randomInt, randomUUID } from "node:crypto";
import type { FileVariable, HttpRequest } from "../parser/httpParser";
import type { ResponseStore } from "./responseStore";

export interface ResolveContext {
  fileVariables: FileVariable[];
  /** Active environment variables, already merged with $shared. */
  environmentVariables: Record<string, string>;
  /** Variables from a .env file next to the .http file ({{$dotenv NAME}}). */
  dotenvVariables?: Record<string, string>;
  /** Process environment for {{$processEnv NAME}}; defaults to process.env. */
  processEnv?: Record<string, string | undefined>;
  /** Previously executed named requests, for {{name.response.body.$.x}} refs. */
  responses?: ResponseStore;
}

const VARIABLE_REF = /\{\{([^{}]+)\}\}/g;

/**
 * Resolve {{variable}} references in a string. Resolution order matches
 * REST Client: file variables shadow environment variables; system
 * variables ($guid, $timestamp, $randomInt) are always available.
 * Unresolvable references are left in place so the user can see them.
 */
export function resolveText(text: string, ctx: ResolveContext): string {
  // File variables may reference other variables; resolve up to a small depth.
  let result = text;
  for (let depth = 0; depth < 5; depth++) {
    let changed = false;
    result = result.replace(VARIABLE_REF, (whole, rawName: string) => {
      const resolved = resolveOne(rawName.trim(), ctx);
      if (resolved === undefined) return whole;
      changed = true;
      return resolved;
    });
    if (!changed) break;
  }
  return result;
}

function resolveOne(name: string, ctx: ResolveContext): string | undefined {
  if (name.startsWith("$")) return resolveSystemVariable(name, ctx);
  const requestVariable = resolveRequestVariable(name, ctx);
  if (requestVariable !== undefined) return requestVariable;
  const fileVariable = [...ctx.fileVariables].reverse().find((v) => v.name === name);
  if (fileVariable) return fileVariable.value;
  if (name in ctx.environmentVariables) return ctx.environmentVariables[name];
  return undefined;
}

/**
 * REST Client "Request Variables": reference a previously executed named
 * request. Supported forms (all case-insensitive on header names):
 *   {{name.response.body.$.json.path}}   JSONPath subset (see parseJsonPath)
 *   {{name.response.body.*}}             full response body (raw string)
 *   {{name.response.headers.Header-Name}}
 *   {{name.request.body.$.json.path}} / {{name.request.body.*}}
 *   {{name.request.headers.X}}
 * Anything that cannot be resolved (unknown name, missing path, non-JSON body
 * for a JSONPath, unsupported XPath) returns undefined so the reference is
 * left in place, matching the rest of the resolver.
 */
const REQUEST_VARIABLE = /^([^.\s]+)\.(request|response)\.(body|headers)\.(.+)$/;

function resolveRequestVariable(name: string, ctx: ResolveContext): string | undefined {
  const store = ctx.responses;
  if (!store) return undefined;
  const match = REQUEST_VARIABLE.exec(name);
  if (!match) return undefined;
  const requestName = match[1]!;
  const kind = match[2]! as "request" | "response";
  const part = match[3]! as "body" | "headers";
  const path = match[4]!.trim();

  const entry = store.get(requestName);
  if (!entry) return undefined;

  if (part === "headers") {
    const entries =
      kind === "request"
        ? entry.request.headers.map((h) => [h.name, h.value] as const)
        : responseHeaderEntries(entry.response.headers);
    return lookupHeader(entries, path);
  }

  const body =
    kind === "request" ? entry.request.body : entry.response.body.toString("utf8");
  if (body === undefined) return undefined;
  if (path === "*") return body;
  return queryJsonBody(body, path);
}

function responseHeaderEntries(
  headers: Record<string, string | string[]>,
): (readonly [string, string])[] {
  return Object.entries(headers).map(
    ([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value] as const,
  );
}

function lookupHeader(
  entries: Iterable<readonly [string, string]>,
  target: string,
): string | undefined {
  const lower = target.toLowerCase();
  for (const [key, value] of entries) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

/**
 * Navigate a parsed JSON body with a small JSONPath subset: a leading `$`,
 * dot navigation (`$.a.b`), and array indices (`$.items[0].id`, `$[0]`).
 * Bracketed string keys (`$["a-b"]`) are also accepted. XPath and filter/
 * wildcard expressions are not supported and yield undefined.
 */
function queryJsonBody(body: string, path: string): string | undefined {
  const tokens = parseJsonPath(path);
  if (!tokens) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  let current: unknown = parsed;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    if (typeof token === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[token];
    } else {
      if (typeof current !== "object" || Array.isArray(current)) return undefined;
      current = (current as Record<string, unknown>)[token];
    }
  }
  if (current === undefined) return undefined;
  return typeof current === "string" ? current : stringifyValue(current);
}

function stringifyValue(value: unknown): string {
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseJsonPath(path: string): (string | number)[] | undefined {
  if (path[0] !== "$") return undefined;
  const tokens: (string | number)[] = [];
  let i = 1;
  while (i < path.length) {
    const ch = path[i]!;
    if (ch === ".") {
      i++;
      let key = "";
      while (i < path.length && ![".", "[", "]"].includes(path[i]!)) {
        key += path[i];
        i++;
      }
      if (key === "") return undefined;
      tokens.push(key);
    } else if (ch === "[") {
      i++;
      let inner = "";
      while (i < path.length && path[i] !== "]") {
        inner += path[i];
        i++;
      }
      if (path[i] !== "]") return undefined; // unterminated bracket
      i++;
      const quoted = inner.match(/^\s*['"](.*)['"]\s*$/);
      if (quoted) {
        tokens.push(quoted[1]!);
      } else if (/^\d+$/.test(inner.trim())) {
        tokens.push(Number(inner.trim()));
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }
  return tokens;
}

function resolveSystemVariable(name: string, ctx: ResolveContext): string | undefined {
  const [keyword, ...args] = name.split(/\s+/);
  switch (keyword) {
    case "$processEnv": {
      const key = args[0];
      if (!key) return undefined;
      return (ctx.processEnv ?? process.env)[key];
    }
    case "$dotenv": {
      const key = args[0];
      if (!key) return undefined;
      return ctx.dotenvVariables?.[key];
    }
    case "$guid":
      return randomUUID();
    case "$timestamp":
      return String(Math.floor(Date.now() / 1000));
    case "$randomInt": {
      const min = Number(args[0] ?? 0);
      const max = Number(args[1] ?? 1000);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return undefined;
      return String(randomInt(min, max));
    }
    case "$datetime": {
      const format = args[0];
      if (format === "iso8601" || format === undefined) return new Date().toISOString();
      if (format === "rfc1123") return new Date().toUTCString();
      return undefined;
    }
    default:
      return undefined;
  }
}

export interface ResolvedRequest {
  method: string;
  url: string;
  headers: { name: string; value: string }[];
  body?: string;
  directives: HttpRequest["directives"];
}

export function resolveRequest(request: HttpRequest, ctx: ResolveContext): ResolvedRequest {
  return {
    method: request.method,
    url: resolveText(request.url, ctx),
    headers: request.headers.map((h) => ({
      name: h.name,
      value: resolveText(h.value, ctx),
    })),
    body: request.body === undefined ? undefined : resolveText(request.body, ctx),
    directives: request.directives,
  };
}
