import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

/**
 * Entry point that downloads a stable VS Code build (cached under
 * `.vscode-test/`) and launches it as an Extension Development Host loading the
 * repo as the extension under test. The mocha suite is driven by `./index`.
 */
async function main(): Promise<void> {
  try {
    // Compiled to dist-test/integration/runTest.js, so ../../ is the repo root
    // where package.json and the esbuild output (dist/extension.js) live.
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");
    const extensionTestsPath = path.resolve(__dirname, "./index");

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ["--disable-extensions", "--disable-gpu"],
    });
  } catch (error) {
    console.error("Integration tests failed to run:", error);
    process.exit(1);
  }
}

void main();
