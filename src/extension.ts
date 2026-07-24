import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { executeRequest } from "./engine/client";
import { CookieJar } from "./engine/cookieJar";
import { parseDotenv } from "./environments/dotenv";
import { EnvironmentManager } from "./environments/manager";
import { LicenseManager } from "./licensing/manager";
import { parseHttpFile, requestAtLine, type HttpRequest } from "./parser/httpParser";
import { runAll } from "./runner/runAll";
import { resolveRequest } from "./variables/resolver";
import { ResponseStore } from "./variables/responseStore";
import { ResponsePanel } from "./ui/responsePanel";

let activeAbort: AbortController | undefined;
let environments: EnvironmentManager;
let responses: ResponseStore;
let cookieJar: CookieJar;

export function activate(context: vscode.ExtensionContext): void {
  environments = new EnvironmentManager(context);
  responses = new ResponseStore();
  cookieJar = new CookieJar();
  const licenses = new LicenseManager(context);
  void licenses.revalidateIfDue();
  context.subscriptions.push(
    ...licenses.register(),
    vscode.languages.registerCodeLensProvider(
      { language: "http" },
      new SendRequestCodeLensProvider(),
    ),
    vscode.commands.registerCommand("restpad.sendRequest", sendRequest),
    vscode.commands.registerCommand("restpad.sendAllRequests", sendAllRequests),
    vscode.commands.registerCommand("restpad.cancelRequest", () => {
      activeAbort?.abort();
      activeAbort = undefined;
    }),
  );
}

export function deactivate(): void {
  activeAbort?.abort();
}

class SendRequestCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const file = parseHttpFile(document.getText());
    const lenses = file.requests.map((request) => {
      const range = new vscode.Range(request.requestLine, 0, request.requestLine, 0);
      return new vscode.CodeLens(range, {
        title: "▶ Send Request",
        command: "restpad.sendRequest",
        arguments: [request.requestLine],
      });
    });
    if (file.requests.length > 1) {
      lenses.unshift(
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: `▶▶ Send All (${file.requests.length})`,
          command: "restpad.sendAllRequests",
        }),
      );
    }
    return lenses;
  }
}

async function sendRequest(atLine?: number): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "http") {
    void vscode.window.showWarningMessage("Open a .http file to send requests.");
    return;
  }

  const file = parseHttpFile(editor.document.getText());
  const line = atLine ?? editor.selection.active.line;
  const request = requestAtLine(file, line);
  if (!request) {
    void vscode.window.showWarningMessage("No request found at cursor.");
    return;
  }

  const config = vscode.workspace.getConfiguration("restpad");
  const resolved = resolveRequest(request, {
    fileVariables: file.variables,
    environmentVariables: environments.variables(),
    dotenvVariables: await loadDotenv(editor.document),
    responses,
  });

  activeAbort?.abort();
  activeAbort = new AbortController();
  const abort = activeAbort;

  const panel = ResponsePanel.show(request);
  try {
    const response = await executeRequest(resolved, {
      timeoutMs: config.get<number>("timeout", 30000),
      followRedirects: config.get<boolean>("followRedirects", true),
      signal: abort.signal,
      cookieJar,
    });
    if (request.name) {
      responses.save(request.name, { request: resolved, response });
    }
    panel.renderResponse(resolved, response);
  } catch (error) {
    if (abort.signal.aborted) {
      panel.renderCancelled();
    } else {
      panel.renderError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

async function sendAllRequests(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "http") {
    void vscode.window.showWarningMessage("Open a .http file to send requests.");
    return;
  }
  const file = parseHttpFile(editor.document.getText());
  if (file.requests.length === 0) {
    void vscode.window.showWarningMessage("No requests in this file.");
    return;
  }

  const config = vscode.workspace.getConfiguration("restpad");
  activeAbort?.abort();
  activeAbort = new AbortController();
  const abort = activeAbort;

  const panel = ResponsePanel.showRun(file.requests.length);
  const context = {
    fileVariables: file.variables,
    environmentVariables: environments.variables(),
    dotenvVariables: await loadDotenv(editor.document),
    responses,
  };

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Restpad: sending all requests",
      cancellable: true,
    },
    async (progress, cancel) => {
      cancel.onCancellationRequested(() => abort.abort());
      const results = await runAll(
        file,
        context,
        executeRequest,
        {
          timeoutMs: config.get<number>("timeout", 30000),
          followRedirects: config.get<boolean>("followRedirects", true),
          signal: abort.signal,
          cookieJar,
        },
        (completed, total) => {
          progress.report({
            message: `${completed}/${total}`,
            increment: 100 / total,
          });
        },
      );
      panel.renderRunSummary(results);
    },
  );
}

/** Read a .env file sitting next to the .http file, if any (REST Client compat). */
async function loadDotenv(document: vscode.TextDocument): Promise<Record<string, string>> {
  if (document.uri.scheme !== "file") return {};
  try {
    const envPath = path.join(path.dirname(document.uri.fsPath), ".env");
    return parseDotenv(await readFile(envPath, "utf8"));
  } catch {
    return {};
  }
}

export type { HttpRequest };
