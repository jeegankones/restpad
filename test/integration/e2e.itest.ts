import * as assert from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { FixtureServer } from "../server/fixtureServer";
import { waitUntil } from "./helpers";

const EXTENSION_ID = "restpad.restpad";

/** Find the tab hosting the restpad response webview, if any. */
function responseWebviewTab(): vscode.Tab | undefined {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (input instanceof vscode.TabInputWebview && input.viewType.includes("restpad.response")) {
        return tab;
      }
    }
  }
  return undefined;
}

describe("end-to-end sendRequest", () => {
  const server = new FixtureServer();
  let tempDir: string;
  let httpFile: vscode.Uri;

  // Recorders that replace the notification APIs so we can prove no error /
  // warning notification surfaces during a successful send.
  const notifications: string[] = [];
  const originalError = vscode.window.showErrorMessage;
  const originalWarning = vscode.window.showWarningMessage;

  before(async () => {
    await server.start();
    tempDir = await mkdtemp(path.join(tmpdir(), "restpad-e2e-"));
    httpFile = vscode.Uri.file(path.join(tempDir, "request.http"));
    await writeFile(
      httpFile.fsPath,
      [
        `POST ${server.baseUrl}/echo`,
        "Content-Type: application/json",
        "",
        '{"hello":"world"}',
        "",
      ].join("\n"),
      "utf8",
    );

    const record = (message: unknown): Thenable<undefined> => {
      notifications.push(String(message));
      return Promise.resolve(undefined);
    };
    (vscode.window as { showErrorMessage: unknown }).showErrorMessage = record;
    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = record;
  });

  after(async () => {
    (vscode.window as { showErrorMessage: unknown }).showErrorMessage = originalError;
    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = originalWarning;
    await server.stop();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("sends a request against the fixture server and opens a response webview without error", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext);
    await ext.activate();

    // Sanity: the fixture server the extension will target is reachable.
    const probe = await fetch(`${server.baseUrl}/echo`, { method: "POST", body: "ping" });
    assert.strictEqual(probe.status, 200, "fixture /echo should respond 200");
    const echoed = (await probe.json()) as { method: string };
    assert.strictEqual(echoed.method, "POST");

    const doc = await vscode.workspace.openTextDocument(httpFile);
    await vscode.window.showTextDocument(doc);
    assert.strictEqual(doc.languageId, "http", "file should open as the http language");

    // Send the request on the first (and only) request line. The command
    // handler resolves only after the response has been rendered.
    await vscode.commands.executeCommand("restpad.sendRequest", 0);

    // The response webview panel must exist.
    await waitUntil(() => responseWebviewTab() !== undefined, {
      message: "response webview panel",
    });
    const tab = responseWebviewTab();
    assert.ok(tab, "a restpad response webview tab should be present");
    assert.ok(tab.label.startsWith("POST"), `unexpected panel title: ${tab.label}`);
    assert.ok(tab.label.includes("/echo"), `panel title should reference the request: ${tab.label}`);

    // No error or warning notification should have been raised.
    assert.deepStrictEqual(
      notifications,
      [],
      `no notifications expected, got: ${notifications.join(" | ")}`,
    );
  });
});
