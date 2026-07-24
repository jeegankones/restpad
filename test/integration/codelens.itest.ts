import * as assert from "node:assert";
import * as vscode from "vscode";

const EXTENSION_ID = "restpad.restpad";

// Three distinct requests separated by ### block markers.
const THREE_REQUESTS = [
  "GET https://example.test/one",
  "",
  "###",
  "",
  "POST https://example.test/two",
  "Content-Type: application/json",
  "",
  '{"n":2}',
  "",
  "###",
  "",
  "DELETE https://example.test/three",
  "",
].join("\n");

describe("code lenses", () => {
  it("provides one '▶ Send Request' lens per request", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext);
    await ext.activate();

    const doc = await vscode.workspace.openTextDocument({
      language: "http",
      content: THREE_REQUESTS,
    });
    await vscode.window.showTextDocument(doc);

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      "vscode.executeCodeLensProvider",
      doc.uri,
    );

    assert.ok(Array.isArray(lenses), "expected an array of code lenses");
    assert.strictEqual(lenses.length, 4, "expected Send All + 3 per-request lenses");

    const sendAll = lenses[0];
    assert.strictEqual(sendAll.command?.title, "▶▶ Send All (3)");
    assert.strictEqual(sendAll.command?.command, "restpad.sendAllRequests");

    for (const lens of lenses.slice(1)) {
      assert.strictEqual(lens.command?.title, "▶ Send Request");
      assert.strictEqual(lens.command?.command, "restpad.sendRequest");
    }
  });
});
