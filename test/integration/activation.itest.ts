import * as assert from "node:assert";
import * as vscode from "vscode";
import { EXTENSION_ID, waitUntil } from "./helpers";

describe("activation", () => {
  it("activates when a .http document is opened and registers its commands", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} should be discoverable`);

    // Opening an http-language document triggers the onLanguage:http
    // activation event contributed in package.json.
    const doc = await vscode.workspace.openTextDocument({
      language: "http",
      content: "GET https://example.test/ping\n",
    });
    await vscode.window.showTextDocument(doc);

    await waitUntil(() => ext.isActive, { message: "extension activation" });
    assert.strictEqual(ext.isActive, true, "extension should be active after opening a .http file");

    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      "restpad.sendRequest",
      "restpad.cancelRequest",
      "restpad.switchEnvironment",
    ]) {
      assert.ok(commands.includes(id), `command ${id} should be registered`);
    }
  });
});
