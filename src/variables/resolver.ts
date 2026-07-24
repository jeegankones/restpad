import { randomInt, randomUUID } from "node:crypto";
import type { FileVariable, HttpRequest } from "../parser/httpParser";

export interface ResolveContext {
  fileVariables: FileVariable[];
  /** Active environment variables, already merged with $shared. */
  environmentVariables: Record<string, string>;
  /** Variables from a .env file next to the .http file ({{$dotenv NAME}}). */
  dotenvVariables?: Record<string, string>;
  /** Process environment for {{$processEnv NAME}}; defaults to process.env. */
  processEnv?: Record<string, string | undefined>;
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
  const fileVariable = [...ctx.fileVariables].reverse().find((v) => v.name === name);
  if (fileVariable) return fileVariable.value;
  if (name in ctx.environmentVariables) return ctx.environmentVariables[name];
  return undefined;
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
