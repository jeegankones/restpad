/** Pure formatting helpers for the response panel. No vscode imports. */

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function statusClass(status: number): "ok" | "redirect" | "client-error" | "server-error" {
  if (status < 300) return "ok";
  if (status < 400) return "redirect";
  if (status < 500) return "client-error";
  return "server-error";
}

/** Skip syntax highlighting above this size; render escaped raw text instead. */
export const HIGHLIGHT_LIMIT = 1024 * 1024;

/**
 * Escape and token-wrap pretty-printed JSON for display. Token colors come
 * from VS Code's debugTokenExpression theme variables, so highlighting adapts
 * to light/dark/high-contrast automatically.
 */
export function highlightJson(pretty: string): string {
  return pretty.replace(
    /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false|null)\b/g,
    (match, str: string | undefined, colon: string | undefined, num: string | undefined, kw: string | undefined) => {
      if (str !== undefined) {
        const cls = colon ? "tok-key" : "tok-str";
        return `<span class="${cls}">${escapeHtml(str)}</span>${colon ?? ""}`;
      }
      if (num !== undefined) return `<span class="tok-num">${num}</span>`;
      if (kw !== undefined) return `<span class="tok-bool">${kw}</span>`;
      return match;
    },
  );
}

export interface BodyRendering {
  /** HTML-safe markup for the body area. */
  html: string;
  /** Language label shown in the Body tab ("JSON", "HTML", "Text", …). */
  label: string;
}

export function renderBody(body: Buffer, contentType: string): BodyRendering {
  if (isProbablyBinary(body)) {
    return {
      html: `<div class="empty-body">Binary response · ${formatSize(body.byteLength)} · ${escapeHtml(contentType || "unknown type")}</div>`,
      label: "Binary",
    };
  }
  const text = body.toString("utf8");
  if (text.length === 0) {
    return { html: `<div class="empty-body">Empty response body</div>`, label: "Body" };
  }
  if (contentType.includes("json")) {
    try {
      const pretty = JSON.stringify(JSON.parse(text), null, 2);
      if (pretty.length <= HIGHLIGHT_LIMIT) {
        return { html: `<pre>${highlightJson(pretty)}</pre>`, label: "JSON" };
      }
      return { html: `<pre>${escapeHtml(pretty)}</pre>`, label: "JSON" };
    } catch {
      return { html: `<pre>${escapeHtml(text)}</pre>`, label: "Text" };
    }
  }
  const label = contentType.includes("html")
    ? "HTML"
    : contentType.includes("xml")
      ? "XML"
      : "Text";
  return { html: `<pre>${escapeHtml(text)}</pre>`, label };
}

export function isProbablyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 1024);
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 9 || (byte > 13 && byte < 32)) suspicious++;
  }
  return sample.length > 0 && suspicious / sample.length > 0.1;
}
