import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { executeRequest } from "./engine/client";
import { parseDotenv } from "./environments/dotenv";
import { EnvironmentManager } from "./environments/manager";
import { parseHttpFile, requestAtLine, type HttpRequest } from "./parser/httpParser";
import { resolveRequest } from "./variables/resolver";
import { ResponseStore } from "./variables/responseStore";
import { ResponsePanel } from "./ui/responsePanel";

let activeAbort: AbortController | undefined;
let environments: EnvironmentManager;
let responses: ResponseStore;

export function activate(context: vscode.ExtensionContext): void {
  environments = new EnvironmentManager(context);
  responses = new ResponseStore();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "http" },
      new SendRequestCodeLensProvider(),
    ),
    vscode.commands.registerCommand("restpad.sendRequest", sendRequest),
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
    return file.requests.map((request) => {
      const range = new vscode.Range(request.requestLine, 0, request.requestLine, 0);
      return new vscode.CodeLens(range, {
        title: "▶ Send Request",
        command: "restpad.sendRequest",
        arguments: [request.requestLine],
      });
    });
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
