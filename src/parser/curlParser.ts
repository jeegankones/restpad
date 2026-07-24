/**
 * Parser for a pasted `curl` command, for REST Client compatibility.
 *
 * REST Client natively accepts a `curl ...` command in place of a
 * `METHOD url` request line. This module reproduces the subset of curl flags
 * REST Client understands and yields the same {method, url, headers, body}
 * shape that `parseBlock` produces for a native request.
 *
 * Pure and synchronous: no shell execution, no I/O, no dependencies.
 * `{{variable}}` references are left in place for the resolver.
 */

import type { HeaderEntry } from "./httpParser";

export interface CurlResult {
  method: string;
  url: string;
  headers: HeaderEntry[];
  body?: string;
}

/**
 * Shell-like tokenizer (no execution). Splits on unquoted whitespace and
 * understands single quotes (fully literal), double quotes (with `\"`, `\\`,
 * `\$`, `` \` `` escapes), unquoted backslash escapes, and `\`-newline line
 * continuations.
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let started = false; // distinguishes an empty quoted token ("") from no token
  let i = 0;
  const n = input.length;

  const push = () => {
    if (started) {
      tokens.push(current);
      current = "";
      started = false;
    }
  };

  while (i < n) {
    const ch = input[i]!;

    if (ch === "\\") {
      const next = input[i + 1];
      // Line continuation: a trailing backslash swallows the newline.
      if (next === "\n") {
        i += 2;
        continue;
      }
      if (next === "\r" && input[i + 2] === "\n") {
        i += 3;
        continue;
      }
      // Otherwise escape the next character literally.
      if (next !== undefined) {
        current += next;
        started = true;
        i += 2;
        continue;
      }
      current += ch;
      started = true;
      i += 1;
      continue;
    }

    if (ch === "'") {
      started = true;
      i += 1;
      while (i < n && input[i] !== "'") {
        current += input[i];
        i += 1;
      }
      i += 1; // consume closing quote (or run off the end)
      continue;
    }

    if (ch === '"') {
      started = true;
      i += 1;
      while (i < n && input[i] !== '"') {
        if (input[i] === "\\") {
          const nx = input[i + 1];
          if (nx === '"' || nx === "\\" || nx === "$" || nx === "`") {
            current += nx;
            i += 2;
            continue;
          }
          if (nx === "\n") {
            i += 2;
            continue;
          }
          if (nx === "\r" && input[i + 2] === "\n") {
            i += 3;
            continue;
          }
          current += "\\";
          i += 1;
          continue;
        }
        current += input[i];
        i += 1;
      }
      i += 1; // consume closing quote
      continue;
    }

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      push();
      i += 1;
      continue;
    }

    current += ch;
    started = true;
    i += 1;
  }

  push();
  return tokens;
}

const DATA_FLAGS = new Set([
  "-d",
  "--data",
  "--data-raw",
  "--data-ascii",
  "--data-urlencode",
]);

/** Parse a raw `curl ...` command block into a request shape. */
export function parseCurl(text: string): CurlResult {
  const tokens = tokenize(text);
  const headers: HeaderEntry[] = [];
  const data: string[] = [];
  const positionals: string[] = [];
  let explicitMethod: string | undefined;
  let userpass: string | undefined;
  let head = false;

  let i = 0;
  if (tokens[i] === "curl") i += 1;

  for (; i < tokens.length; i++) {
    const tok = tokens[i]!;

    if (tok === "-X" || tok === "--request") {
      explicitMethod = tokens[++i];
    } else if (isAttachedShort(tok, "X")) {
      explicitMethod = tok.slice(2);
    } else if (tok === "-H" || tok === "--header") {
      const v = tokens[++i];
      if (v !== undefined) pushHeader(headers, v);
    } else if (isAttachedShort(tok, "H")) {
      pushHeader(headers, tok.slice(2));
    } else if (DATA_FLAGS.has(tok)) {
      const v = tokens[++i];
      if (v !== undefined) data.push(v);
    } else if (isAttachedShort(tok, "d")) {
      data.push(tok.slice(2));
    } else if (tok === "-u" || tok === "--user") {
      userpass = tokens[++i];
    } else if (isAttachedShort(tok, "u")) {
      userpass = tok.slice(2);
    } else if (tok === "-I" || tok === "--head") {
      head = true;
    } else if (tok.startsWith("-")) {
      // Unrecognized flag: ignore. Its value (if any) may be misread as the
      // URL, but the flag subset above covers everything REST Client emits.
    } else {
      positionals.push(tok);
    }
  }

  if (userpass !== undefined) {
    const encoded = Buffer.from(userpass, "utf8").toString("base64");
    headers.push({ name: "Authorization", value: `Basic ${encoded}` });
  }

  const method = (
    explicitMethod ?? (head ? "HEAD" : data.length ? "POST" : "GET")
  ).toUpperCase();

  return {
    method,
    url: positionals[0] ?? "",
    headers,
    body: data.length ? data.join("&") : undefined,
  };
}

/** True for a short flag with an attached value, e.g. `-XPOST`, `-H"a: b"`. */
function isAttachedShort(tok: string, letter: string): boolean {
  return tok.length > 2 && tok[0] === "-" && tok[1] === letter;
}

function pushHeader(headers: HeaderEntry[], raw: string): void {
  const idx = raw.indexOf(":");
  if (idx === -1) {
    headers.push({ name: raw.trim(), value: "" });
    return;
  }
  headers.push({ name: raw.slice(0, idx).trim(), value: raw.slice(idx + 1).trim() });
}
