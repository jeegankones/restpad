import { performance } from "node:perf_hooks";
import { request as undiciRequest } from "undici";
import type { ResolvedRequest } from "../variables/resolver";
import type { CookieJar } from "./cookieJar";

export interface ExecuteOptions {
  timeoutMs: number;
  followRedirects: boolean;
  signal?: AbortSignal;
  cookieJar?: CookieJar;
}

export interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string | string[]>;
  body: Buffer;
  /** Total wall-clock time in milliseconds. */
  durationMs: number;
  bodySize: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 10;

export async function executeRequest(
  resolved: ResolvedRequest,
  options: ExecuteOptions,
): Promise<ResponseData> {
  const started = performance.now();
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  const headers: Record<string, string> = {};
  for (const header of resolved.headers) headers[header.name] = header.value;

  const followRedirects =
    options.followRedirects && resolved.directives["no-redirect"] !== true;

  let url = resolved.url;
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  let method = resolved.method;
  let body: string | undefined = resolved.body;

  // The jar is bypassed entirely when the user sends an explicit Cookie
  // header or sets # @no-cookie-jar (REST Client behavior).
  const jar =
    resolved.directives["no-cookie-jar"] === true ||
    resolved.headers.some((h) => h.name.toLowerCase() === "cookie")
      ? undefined
      : options.cookieJar;

  for (let hop = 0; ; hop++) {
    const hopHeaders = { ...headers };
    const cookieHeader = jar?.cookieHeader(url);
    if (cookieHeader) hopHeaders["Cookie"] = cookieHeader;

    const response = await undiciRequest(url, {
      method: method as never,
      headers: hopHeaders,
      body,
      signal,
    });

    if (jar) {
      const setCookie = response.headers["set-cookie"];
      if (setCookie) {
        jar.storeFromResponse(url, Array.isArray(setCookie) ? setCookie : [setCookie]);
      }
    }

    if (followRedirects && REDIRECT_STATUSES.has(response.statusCode) && hop < MAX_REDIRECTS) {
      const location = response.headers["location"];
      if (typeof location === "string") {
        await response.body.dump();
        url = new URL(location, url).toString();
        if (response.statusCode === 303 || (response.statusCode !== 307 && response.statusCode !== 308 && method === "POST")) {
          method = "GET";
          body = undefined;
        }
        continue;
      }
    }

    const bodyBuffer = Buffer.from(await response.body.arrayBuffer());
    return {
      status: response.statusCode,
      statusText: statusText(response.statusCode),
      headers: response.headers as Record<string, string | string[]>,
      body: bodyBuffer,
      durationMs: performance.now() - started,
      bodySize: bodyBuffer.byteLength,
    };
  }
}

const STATUS_TEXT: Record<number, string> = {
  200: "OK", 201: "Created", 202: "Accepted", 204: "No Content",
  301: "Moved Permanently", 302: "Found", 303: "See Other", 304: "Not Modified",
  307: "Temporary Redirect", 308: "Permanent Redirect",
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
  405: "Method Not Allowed", 409: "Conflict", 415: "Unsupported Media Type",
  422: "Unprocessable Entity", 429: "Too Many Requests",
  500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
  504: "Gateway Timeout",
};

function statusText(code: number): string {
  return STATUS_TEXT[code] ?? "";
}
