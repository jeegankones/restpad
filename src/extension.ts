import * as vscode from "vscode";
import { executeRequest } from "./engine/client";
import { parseHttpFile, requestAtLine, type HttpRequest } from "./parser/httpParser";
import { resolveRequest } from "./variables/resolver";
import { ResponsePanel } from "./ui/responsePanel";

let activeAbort: AbortController | undefined;

export function activate(context: vscode.ExtensionContext): void {
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
    environmentVariables: activeEnvironmentVariables(config),
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
    panel.renderResponse(resolved, response);
  } catch (error) {
    if (abort.signal.aborted) {
      panel.renderCancelled();
    } else {
      panel.renderError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function activeEnvironmentVariables(
  config: vscode.WorkspaceConfiguration,
): Record<string, string> {
  // Environment switching UI lands with the environments milestone; until
  // then, $shared variables apply so shared setups already work.
  const all = config.get<Record<string, Record<string, string>>>("environmentVariables", {});
  return { ...all["$shared"] };
}

export type { HttpRequest };
