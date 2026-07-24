import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { ResponseData } from "../engine/client";
import type { HttpRequest } from "../parser/httpParser";
import type { RunResult } from "../runner/runAll";
import type { ResolvedRequest } from "../variables/resolver";
import {
  escapeHtml,
  formatDuration,
  formatSize,
  renderBody,
  statusClass,
} from "./format";

/**
 * Webview panel showing the response for the most recent request. A single
 * reusable panel beside the editor, styled entirely with VS Code theme
 * variables so light/dark/high-contrast all render correctly.
 */
export class ResponsePanel {
  private static current: ResponsePanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private lastRawBody = "";

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
      { enableScripts: true, retainContextWhenHidden: true },
    );
    ResponsePanel.current = new ResponsePanel(panel);
    ResponsePanel.current.renderLoading();
    return ResponsePanel.current;
  }

  static showRun(requestCount: number): ResponsePanel {
    const panel = ResponsePanel.show({
      method: "RUN",
      url: `${requestCount} requests`,
    } as HttpRequest);
    panel.panel.title = `Run All (${requestCount})`;
    return panel;
  }

  renderRunSummary(results: RunResult[]): void {
    const rows = results
      .map((result) => {
        const status = result.response
          ? `<span class="status ${statusClass(result.response.status)}">${result.response.status}</span>`
          : `<span class="status server-error">ERR</span>`;
        const detail = result.response
          ? `${formatDuration(result.response.durationMs)} · ${formatSize(result.response.bodySize)}`
          : escapeHtml(result.error?.message ?? "failed");
        const label = result.request.name
          ? `<strong>${escapeHtml(result.request.name)}</strong> · `
          : "";
        return `<tr>
          <td>${status}</td>
          <td>${label}${escapeHtml(result.resolved.method)} ${escapeHtml(truncate(result.resolved.url, 60))}</td>
          <td class="detail">${detail}</td>
        </tr>`;
      })
      .join("");
    const failures = results.filter((r) => !r.response || r.response.status >= 400).length;
    this.panel.webview.html = this.page(`
      <div class="statusline">
        <span class="status ${failures === 0 ? "ok" : "server-error"}">
          ${results.length} requests · ${failures === 0 ? "all passed" : `${failures} failed`}
        </span>
      </div>
      <table class="run-summary">${rows}</table>`);
  }

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    panel.onDidDispose(() => {
      if (ResponsePanel.current === this) ResponsePanel.current = undefined;
    });
    panel.webview.onDidReceiveMessage((message: { command?: string }) => {
      if (message.command === "copyBody") {
        void vscode.env.clipboard.writeText(this.lastRawBody);
        void vscode.window.setStatusBarMessage("Restpad: response body copied", 2000);
      }
    });
  }

  renderLoading(): void {
    this.panel.webview.html = this.page(
      `<div class="state"><span class="spinner"></span>Sending request…</div>`,
    );
  }

  renderCancelled(): void {
    this.panel.webview.html = this.page(`<div class="state">Request cancelled.</div>`);
  }

  renderError(error: Error): void {
    this.panel.webview.html = this.page(`
      <div class="statusline">
        <span class="status server-error">Request failed</span>
      </div>
      <pre class="error-detail">${escapeHtml(error.message)}</pre>`);
  }

  renderResponse(request: ResolvedRequest, response: ResponseData): void {
    const contentType = String(response.headers["content-type"] ?? "");
    this.lastRawBody = response.body.toString("utf8");
    const body = renderBody(response.body, contentType);

    const headerRows = Object.entries(response.headers)
      .map(
        ([name, value]) =>
          `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(
            Array.isArray(value) ? value.join(", ") : String(value),
          )}</td></tr>`,
      )
      .join("");

    const rawRequest = [
      `${request.method} ${request.url}`,
      ...request.headers.map((h) => `${h.name}: ${h.value}`),
      ...(request.body ? ["", request.body] : []),
    ].join("\n");

    this.panel.webview.html = this.page(`
      <div class="statusline">
        <span class="status ${statusClass(response.status)}">${response.status}${
          response.statusText ? " " + escapeHtml(response.statusText) : ""
        }</span>
        <span class="chip">${formatDuration(response.durationMs)}</span>
        <span class="chip">${formatSize(response.bodySize)}</span>
        <button class="copy" id="copy-body" title="Copy response body">Copy</button>
      </div>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected="true" data-tab="body">${escapeHtml(body.label)}</button>
        <button role="tab" aria-selected="false" data-tab="headers">Headers <span class="count">${
          Object.keys(response.headers).length
        }</span></button>
        <button role="tab" aria-selected="false" data-tab="request">Request</button>
      </div>
      <section data-panel="body" class="active">${body.html}</section>
      <section data-panel="headers"><table>${headerRows}</table></section>
      <section data-panel="request"><pre>${escapeHtml(rawRequest)}</pre></section>`);
  }

  private page(content: string): string {
    const nonce = randomBytes(16).toString("base64");
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    color: var(--vscode-editor-foreground);
    padding: 0 14px 14px;
    animation: appear 120ms ease-out;
  }
  @keyframes appear { from { opacity: 0; transform: translateY(2px); } }

  .statusline {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 0 10px;
    border-bottom: 1px solid var(--vscode-widget-border, transparent);
    position: sticky; top: 0;
    background: var(--vscode-editor-background);
  }
  .status {
    font-weight: 700; letter-spacing: 0.02em;
    padding: 2px 10px; border-radius: 3px;
    border: 1px solid transparent;
  }
  .status.ok { color: var(--vscode-testing-iconPassed, #2da042); border-color: currentColor; }
  .status.redirect { color: var(--vscode-charts-yellow, #c8a000); border-color: currentColor; }
  .status.client-error,
  .status.server-error { color: var(--vscode-testing-iconFailed, #e05252); border-color: currentColor; }
  .chip {
    opacity: 0.75; font-size: 0.92em;
    padding: 2px 8px; border-radius: 999px;
    background: var(--vscode-badge-background, #4443);
    color: var(--vscode-badge-foreground, inherit);
  }
  .copy {
    margin-left: auto;
    font: inherit; font-size: 0.92em;
    color: var(--vscode-button-secondaryForeground, inherit);
    background: var(--vscode-button-secondaryBackground, transparent);
    border: 1px solid var(--vscode-widget-border, currentColor);
    border-radius: 3px; padding: 2px 10px; cursor: pointer;
  }
  .copy:hover { background: var(--vscode-button-secondaryHoverBackground, #6663); }
  .copy:focus-visible, [role="tab"]:focus-visible {
    outline: 2px solid var(--vscode-focusBorder); outline-offset: 1px;
  }

  .tabs { display: flex; gap: 2px; margin: 10px 0 0; }
  [role="tab"] {
    font: inherit; cursor: pointer;
    color: inherit; opacity: 0.65;
    background: none; border: none;
    padding: 4px 10px 6px;
    border-bottom: 2px solid transparent;
  }
  [role="tab"][aria-selected="true"] {
    opacity: 1;
    border-bottom-color: var(--vscode-focusBorder, currentColor);
  }
  .count {
    font-size: 0.85em; opacity: 0.8;
    background: var(--vscode-badge-background, #4443);
    color: var(--vscode-badge-foreground, inherit);
    border-radius: 999px; padding: 0 6px; margin-left: 2px;
  }

  section { display: none; padding-top: 8px; }
  section.active { display: block; }

  pre {
    margin: 0;
    background: var(--vscode-textCodeBlock-background, #8881 );
    padding: 12px; border-radius: 4px;
    overflow: auto; white-space: pre-wrap; word-break: break-word;
    line-height: 1.5;
  }
  .tok-key { color: var(--vscode-debugTokenExpression-name, #9cdcfe); }
  .tok-str { color: var(--vscode-debugTokenExpression-string, #ce9178); }
  .tok-num { color: var(--vscode-debugTokenExpression-number, #b5cea8); }
  .tok-bool { color: var(--vscode-debugTokenExpression-boolean, #569cd6); }

  table { border-collapse: collapse; width: 100%; }
  td { padding: 4px 10px; border-bottom: 1px solid var(--vscode-widget-border, #4443); vertical-align: top; }
  td:first-child { font-weight: 600; white-space: nowrap; opacity: 0.9; }

  .state { padding: 24px 0; opacity: 0.75; display: flex; align-items: center; gap: 8px; }
  .empty-body { padding: 18px 0; opacity: 0.65; font-style: italic; }
  .error-detail { margin-top: 10px; }
  .spinner {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid currentColor; border-top-color: transparent;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    body { animation: none; }
    .spinner { animation-duration: 2s; }
  }
</style>
</head>
<body>
${content}
<script nonce="${nonce}">
  const vscodeApi = acquireVsCodeApi();
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    tab.addEventListener("click", () => {
      for (const t of document.querySelectorAll('[role="tab"]'))
        t.setAttribute("aria-selected", String(t === tab));
      for (const p of document.querySelectorAll("section[data-panel]"))
        p.classList.toggle("active", p.dataset.panel === tab.dataset.tab);
    });
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      const index = tabs.indexOf(tab);
      const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      next.click();
    });
  }
  document.getElementById("copy-body")?.addEventListener("click", () => {
    vscodeApi.postMessage({ command: "copyBody" });
  });
</script>
</body>
</html>`;
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
