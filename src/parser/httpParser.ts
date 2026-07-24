/**
 * Parser for .http / .rest files, compatible with the syntax of the
 * `humao.rest-client` extension so existing files work unchanged.
 *
 * Parsing is pure and synchronous: no I/O, no variable resolution.
 * `{{variable}}` references are left in place for the resolver.
 */

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
  /** `<@ ./file` — process variables inside the referenced file. */
  processVariables: boolean;
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
const QUERY_CONTINUATION = /^\s+[?&]/;
const BODY_FILE_REF = /^<(@)?\s+(.+)$/;

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
  let name: string | undefined;
  let i = start;

  // Preamble: comments, directives, file variables, blank lines.
  for (; i <= end; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    const directive = line.match(DIRECTIVE);
    if (directive) {
      const [, key, value] = directive;
      if (key === "name" && value) name = value.trim();
      else directives[key!] = value?.trim() || true;
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
        bodyFile = { path: fileRef[2]!.trim(), processVariables: fileRef[1] === "@" };
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
    startLine: requestLine,
    endLine,
    requestLine,
  };
}

/** Find the request whose block contains the given 0-based line. */
export function requestAtLine(file: HttpFile, line: number): HttpRequest | undefined {
  return file.requests.find((r) => line >= r.startLine && line <= r.endLine);
}
