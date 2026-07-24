import * as vscode from "vscode";
import type { ResponseData } from "../engine/client";
import type { HttpRequest } from "../parser/httpParser";
import type { ResolvedRequest } from "../variables/resolver";

/**
 * Webview panel showing the response for the most recent request.
 * A single reusable panel, like REST Client's response view.
 */
export class ResponsePanel {
  private static current: ResponsePanel | undefined;
  private readonly panel: vscode.WebviewPanel;

  static show(request: HttpRequest): ResponsePanel {
    const title = `${request.method} ${truncate(request.url, 40)}`;
    if (ResponsePanel.current) {
      ResponsePanel.current.panel.title = title;
      ResponsePanel.current.renderLoading();
      ResponsePanel.current.panel.reveal(vscode.ViewColumn.Beside, true);
      return ResponsePanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      "restpad.response",
      title,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: false },
    );
    ResponsePanel.current = new ResponsePanel(panel);
    ResponsePanel.current.renderLoading();
    return ResponsePanel.current;
  }

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    panel.onDidDispose(() => {
      if (ResponsePanel.current === this) ResponsePanel.current = undefined;
    });
  }

  renderLoading(): void {
    this.panel.webview.html = page("<p class='muted'>Sending request…</p>");
  }

  renderCancelled(): void {
    this.panel.webview.html = page("<p class='muted'>Request cancelled.</p>");
  }

  renderError(error: Error): void {
    this.panel.webview.html = page(
      `<p class="status error">Request failed</p><pre>${escapeHtml(error.message)}</pre>`,
    );
  }

  renderResponse(request: ResolvedRequest, response: ResponseData): void {
    const statusClass =
      response.status < 300 ? "ok" : response.status < 400 ? "redirect" : "error";
    const headerRows = Object.entries(response.headers)
      .map(
        ([name, value]) =>
          `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(
            Array.isArray(value) ? value.join(", ") : String(value),
          )}</td></tr>`,
      )
      .join("");

    this.panel.webview.html = page(`
      <p>
        <span class="status ${statusClass}">${response.status} ${escapeHtml(response.statusText)}</span>
        <span class="muted">${response.durationMs.toFixed(0)} ms · ${formatSize(response.bodySize)}</span>
      </p>
      <pre>${escapeHtml(formatBody(response))}</pre>
      <details>
        <summary>Response headers (${Object.keys(response.headers).length})</summary>
        <table>${headerRows}</table>
      </details>
      <details>
        <summary>Request</summary>
        <pre>${escapeHtml(`${request.method} ${request.url}`)}</pre>
      </details>
    `);
  }
}

function formatBody(response: ResponseData): string {
  const contentType = String(response.headers["content-type"] ?? "");
  const text = response.body.toString("utf8");
  if (contentType.includes("json")) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  if (isProbablyBinary(response.body)) {
    return `<binary response: ${formatSize(response.bodySize)}, ${contentType || "unknown type"}>`;
  }
  return text;
}

function isProbablyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 1024);
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 9 || (byte > 13 && byte < 32)) suspicious++;
  }
  return sample.length > 0 && suspicious / sample.length > 0.1;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function page(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-editor-font-family); font-size: 13px; padding: 0 12px; }
  pre { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
  .status { font-weight: 600; padding: 2px 8px; border-radius: 4px; }
  .status.ok { background: rgba(0, 160, 60, 0.2); color: var(--vscode-testing-iconPassed, #2da042); }
  .status.redirect { background: rgba(200, 160, 0, 0.2); }
  .status.error { background: rgba(200, 40, 40, 0.2); color: var(--vscode-testing-iconFailed, #e05252); }
  .muted { opacity: 0.7; margin-left: 8px; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 3px 8px; border-bottom: 1px solid var(--vscode-widget-border, #4444); vertical-align: top; }
  td:first-child { font-weight: 600; white-space: nowrap; }
  details { margin: 10px 0; }
  summary { cursor: pointer; opacity: 0.8; }
</style>
</head>
<body>${content}</body>
</html>`;
}
