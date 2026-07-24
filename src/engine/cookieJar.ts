/**
 * Minimal in-memory cookie jar (RFC 6265 subset): domain and path matching,
 * Expires/Max-Age expiry, Secure. Session-scoped — REST Client-style
 * persistence across restarts is deliberately not implemented yet.
 */

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  /** True when Domain attribute was present (allows subdomain matching). */
  includeSubdomains: boolean;
  path: string;
  /** Epoch ms; undefined = session cookie. */
  expiresAt?: number;
  secure: boolean;
}

export class CookieJar {
  private cookies: StoredCookie[] = [];

  storeFromResponse(url: string, setCookieHeaders: string[], now = Date.now()): void {
    const { hostname, pathname } = new URL(url);
    for (const header of setCookieHeaders) {
      const cookie = parseSetCookie(header, hostname, pathname, now);
      if (!cookie) continue;
      this.cookies = this.cookies.filter(
        (c) => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path),
      );
      // An already-expired cookie is a deletion request.
      if (cookie.expiresAt === undefined || cookie.expiresAt > now) {
        this.cookies.push(cookie);
      }
    }
  }

  cookieHeader(url: string, now = Date.now()): string | undefined {
    const { hostname, pathname, protocol } = new URL(url);
    this.cookies = this.cookies.filter((c) => c.expiresAt === undefined || c.expiresAt > now);
    const matched = this.cookies.filter(
      (c) =>
        domainMatches(hostname, c) &&
        pathMatches(pathname, c.path) &&
        (!c.secure || protocol === "https:"),
    );
    if (matched.length === 0) return undefined;
    // Longer paths first, per RFC 6265 5.4.
    matched.sort((a, b) => b.path.length - a.path.length);
    return matched.map((c) => `${c.name}=${c.value}`).join("; ");
  }

  clear(): void {
    this.cookies = [];
  }
}

function parseSetCookie(
  header: string,
  requestHost: string,
  requestPath: string,
  now: number,
): StoredCookie | undefined {
  const [pair, ...attributes] = header.split(";");
  const eq = pair!.indexOf("=");
  if (eq <= 0) return undefined;
  const name = pair!.slice(0, eq).trim();
  const value = pair!.slice(eq + 1).trim();

  const cookie: StoredCookie = {
    name,
    value,
    domain: requestHost,
    includeSubdomains: false,
    path: defaultPath(requestPath),
    secure: false,
  };

  for (const rawAttribute of attributes) {
    const [attributeName, ...rest] = rawAttribute.split("=");
    const key = attributeName!.trim().toLowerCase();
    const attributeValue = rest.join("=").trim();
    switch (key) {
      case "domain": {
        const domain = attributeValue.replace(/^\./, "").toLowerCase();
        // Reject cookies claiming an unrelated domain.
        if (domain && (requestHost === domain || requestHost.endsWith(`.${domain}`))) {
          cookie.domain = domain;
          cookie.includeSubdomains = true;
        }
        break;
      }
      case "path":
        if (attributeValue.startsWith("/")) cookie.path = attributeValue;
        break;
      case "max-age": {
        const seconds = Number(attributeValue);
        if (Number.isFinite(seconds)) cookie.expiresAt = now + seconds * 1000;
        break;
      }
      case "expires": {
        // Max-Age wins over Expires.
        if (cookie.expiresAt === undefined) {
          const parsed = Date.parse(attributeValue);
          if (!Number.isNaN(parsed)) cookie.expiresAt = parsed;
        }
        break;
      }
      case "secure":
        cookie.secure = true;
        break;
    }
  }
  return cookie;
}

function domainMatches(host: string, cookie: StoredCookie): boolean {
  if (host === cookie.domain) return true;
  return cookie.includeSubdomains && host.endsWith(`.${cookie.domain}`);
}

function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}

function defaultPath(requestPath: string): string {
  const lastSlash = requestPath.lastIndexOf("/");
  return lastSlash <= 0 ? "/" : requestPath.slice(0, lastSlash);
}
