import * as path from "node:path";
import Mocha from "mocha";
import { glob } from "glob";

/**
 * Loaded inside the Extension Development Host by @vscode/test-electron.
 * Collects every compiled `*.test.js` in this directory and runs them under
 * mocha's bdd interface. Rejecting on any failure makes the CLI exit non-zero.
 */
export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: "bdd",
    color: true,
    timeout: 60_000,
  });

  const testsRoot = __dirname;

  return glob("**/*.itest.js", { cwd: testsRoot }).then((files) => {
    for (const file of files) {
      mocha.addFile(path.resolve(testsRoot, file));
    }

    return new Promise<void>((resolve, reject) => {
      try {
        mocha.run((failures) => {
          if (failures > 0) {
            reject(new Error(`${failures} integration test(s) failed.`));
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}
