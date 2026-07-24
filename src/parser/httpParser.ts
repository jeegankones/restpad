/**
 * Parser for .http / .rest files, compatible with the syntax of the
 * `humao.rest-client` extension so existing files work unchanged.
 *
 * Parsing is pure and synchronous: no I/O, no variable resolution.
 * `{{variable}}` references are left in place for the resolver.
 */

import { parseCurl } from "./curlParser";

export interface HeaderEntry {
  name: string;
  value: string;
}

export interface FileVariable {
  name: string;
  value: string;
  line: number;
}

export interface BodyFileRef {
  path: string;
  /** `<@ ./file`: process variables inside the referenced file. */
  processVariables: boolean;
  /** `<@latin1 ./file`: file encoding override; defaults to utf8. */
  encoding?: string;
}

export interface PromptVariable {
  name: string;
  description?: string;
}

export interface HttpRequest {
  /** From `# @name foo`. */
  name?: string;
  method: string;
  url: string;
  httpVersion?: string;
  headers: HeaderEntry[];
  body?: string;
  bodyFile?: BodyFileRef;
  /** `# @key value` directives, e.g. no-redirect, no-cookie-jar. */
  directives: Record<string, string | true>;
  /** `# @prompt name [description]`: one entry per prompt line. */
  prompts: PromptVariable[];
  /** 0-based, inclusive. Used for CodeLens placement and cursor lookup. */
  startLine: number;
  endLine: number;
  requestLine: number;
}

export interface HttpFile {
  variables: FileVariable[];
  requests: HttpRequest[];
}

const SEPARATOR = /^###/;
const COMMENT = /^\s*(#|\/\/)/;
const DIRECTIVE = /^\s*(?:#|\/\/)\s*@([A-Za-z][\w-]*)(?:\s+(.*?))?\s*$/;
const FILE_VARIABLE = /^@([\w.-]+)\s*=\s*(.*)$/;
const REQUEST_LINE =
  /^(?:(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT|LOCK|UNLOCK|PROPFIND|PROPPATCH|COPY|MOVE|MKCOL|MKCALENDAR|ACL|SEARCH)\s+)?(.+?)(?:\s+(HTTP\/[\d.]+))?\s*$/i;
const HEADER_LINE = /^([\w-]+)\s*:\s*(.*)$/;
/** A request line that is a pasted `curl` command (case-sensitive, word boundary). */
const CURL_REQUEST = /^curl(?:\s|$)/;
const QUERY_CONTINUATION = /^\s+[?&]/;
const BODY_FILE_REF = /^<(?:@([\w-]*))?\s+(.+)$/;

export function parseHttpFile(text: string): HttpFile {
  const lines = text.split(/\r?\n/);
  const variables: FileVariable[] = [];
  const requests: HttpRequest[] = [];

  // Block boundaries: lines starting with ###.
  const blockStarts: number[] = [0];
  for (let i = 0; i < lines.length; i++) {
    if (SEPARATOR.test(lines[i]!)) {
      blockStarts.push(i + 1);
    }
  }
  blockStarts.push(lines.length + 1);

  for (let b = 0; b < blockStarts.length - 1; b++) {
    const start = blockStarts[b]!;
    const end = Math.min(blockStarts[b + 1]! - 1, lines.length) - 1;
    if (start > end) continue;
    const request = parseBlock(lines, start, end, variables);
    if (request) requests.push(request);
  }

  return { variables, requests };
}

function parseBlock(
  lines: string[],
  start: number,
  end: number,
  variables: FileVariable[],
): HttpRequest | undefined {
  const directives: Record<string, string | true> = {};
  const prompts: PromptVariable[] = [];
  let name: string | undefined;
  let i = start;

  // Preamble: comments, directives, file variables, blank lines.
  for (; i <= end; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    const directive = line.match(DIRECTIVE);
    if (directive) {
      const [, key, value] = directive;
      if (key === "name" && value) {
        name = value.trim();
      } else if (key === "prompt" && value) {
        const [promptName, ...description] = value.trim().split(/\s+/);
        prompts.push({
          name: promptName!,
          description: description.length ? description.join(" ") : undefined,
        });
      } else {
        directives[key!] = value?.trim() || true;
      }
      continue;
    }
    if (COMMENT.test(line)) continue;
    const fileVar = line.match(FILE_VARIABLE);
    if (fileVar) {
      variables.push({ name: fileVar[1]!, value: fileVar[2]!.trim(), line: i });
      continue;
    }
    break; // request line reached
  }
  if (i > end) return undefined; // block had no request (variables/comments only)

  const requestLine = i;

  // cURL-format request: delegate to the curl parser. REST Client accepts a
  // pasted `curl ...` command in place of a native request line.
  if (CURL_REQUEST.test(lines[i]!.trim())) {
    const parsed = parseCurl(lines.slice(i, end + 1).join("\n"));
    let curlEnd = end;
    while (curlEnd > requestLine && lines[curlEnd]!.trim() === "") curlEnd--;
    return {
      name,
      method: parsed.method,
      url: parsed.url,
      httpVersion: undefined,
      headers: parsed.headers,
      body: parsed.body,
      bodyFile: undefined,
      directives,
      prompts,
      startLine: requestLine,
      endLine: curlEnd,
      requestLine,
    };
  }

  const match = lines[i]!.trim().match(REQUEST_LINE);
  if (!match || !match[2]) return undefined;
  const method = (match[1] ?? "GET").toUpperCase();
  let url = match[2];
  const httpVersion = match[3];
  i++;

  // Query continuation lines: indented lines starting with ? or &.
  for (; i <= end; i++) {
    const line = lines[i]!;
    if (QUERY_CONTINUATION.test(line)) {
      url += line.trim();
    } else {
      break;
    }
  }

  // Headers until blank line.
  const headers: HeaderEntry[] = [];
  for (; i <= end; i++) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i++;
      break;
    }
    if (COMMENT.test(line) && !DIRECTIVE.test(line)) continue;
    const header = line.match(HEADER_LINE);
    if (header) {
      headers.push({ name: header[1]!, value: header[2]!.trim() });
    } else {
      break; // tolerate malformed line by ending headers
    }
  }

  // Body: rest of block, trailing blank lines trimmed.
  let body: string | undefined;
  let bodyFile: BodyFileRef | undefined;
  if (i <= end) {
    let bodyEnd = end;
    while (bodyEnd >= i && lines[bodyEnd]!.trim() === "") bodyEnd--;
    if (bodyEnd >= i) {
      const bodyLines = lines.slice(i, bodyEnd + 1);
      const fileRef = bodyLines.length === 1 && bodyLines[0]!.trim().match(BODY_FILE_REF);
      if (fileRef) {
        bodyFile = {
          path: fileRef[2]!.trim(),
          processVariables: fileRef[1] !== undefined,
          encoding: fileRef[1] || undefined,
        };
      } else if (isFormUrlencoded(headers)) {
        // REST Client lets each key=value pair sit on its own &-prefixed line.
        body = bodyLines
          .map((line) => line.trim())
          .filter((line) => line !== "")
          .reduce((joined, line) => (line.startsWith("&") ? joined + line : joined ? `${joined}\n${line}` : line), "");
      } else {
        body = bodyLines.join("\n");
      }
    }
  }

  let endLine = end;
  while (endLine > requestLine && lines[endLine]!.trim() === "") endLine--;

  return {
    name,
    method,
    url,
    httpVersion,
    headers,
    body,
    bodyFile,
    directives,
    prompts,
    startLine: requestLine,
    endLine,
    requestLine,
  };
}

function isFormUrlencoded(headers: HeaderEntry[]): boolean {
  return headers.some(
    (h) =>
      h.name.toLowerCase() === "content-type" &&
      h.value.toLowerCase().includes("application/x-www-form-urlencoded"),
  );
}

/** Find the request whose block contains the given 0-based line. */
export function requestAtLine(file: HttpFile, line: number): HttpRequest | undefined {
  return file.requests.find((r) => line >= r.startLine && line <= r.endLine);
}
