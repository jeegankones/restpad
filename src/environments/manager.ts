import * as vscode from "vscode";
import { environmentNames, mergeEnvironment, type EnvironmentConfig } from "./merge";

const STATE_KEY = "restpad.activeEnvironment";
const NO_ENVIRONMENT_LABEL = "No Environment";

/**
 * Tracks the active environment (persisted per workspace) and exposes the
 * merged variable set. Shown in the status bar while a .http editor is active.
 */
export class EnvironmentManager {
  private readonly statusBar: vscode.StatusBarItem;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBar.command = "restpad.switchEnvironment";
    this.statusBar.tooltip = "Restpad: switch environment";
    context.subscriptions.push(
      this.statusBar,
      vscode.commands.registerCommand("restpad.switchEnvironment", () => this.switchEnvironment()),
      vscode.window.onDidChangeActiveTextEditor(() => this.updateStatusBar()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("restpad.environmentVariables")) this.updateStatusBar();
      }),
    );
    this.updateStatusBar();
  }

  get active(): string | undefined {
    return this.context.workspaceState.get<string>(STATE_KEY);
  }

  /** Merged $shared + active environment variables. */
  variables(): Record<string, string> {
    return mergeEnvironment(this.config(), this.active);
  }

  private config(): EnvironmentConfig {
    return vscode.workspace
      .getConfiguration("restpad")
      .get<EnvironmentConfig>("environmentVariables", {});
  }

  private async switchEnvironment(): Promise<void> {
    const names = environmentNames(this.config());
    const active = this.active;
    const items: vscode.QuickPickItem[] = [
      {
        label: NO_ENVIRONMENT_LABEL,
        description: active === undefined ? "current" : undefined,
      },
      ...names.map((name) => ({
        label: name,
        description: name === active ? "current" : undefined,
      })),
    ];
    if (names.length === 0) {
      const open = "Open Settings";
      const choice = await vscode.window.showInformationMessage(
        'No environments configured. Add them under "restpad.environmentVariables".',
        open,
      );
      if (choice === open) {
        void vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "restpad.environmentVariables",
        );
      }
      return;
    }
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Select the active Restpad environment",
    });
    if (!picked) return;
    await this.context.workspaceState.update(
      STATE_KEY,
      picked.label === NO_ENVIRONMENT_LABEL ? undefined : picked.label,
    );
    this.updateStatusBar();
  }

  private updateStatusBar(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.languageId !== "http") {
      this.statusBar.hide();
      return;
    }
    this.statusBar.text = `$(globe) ${this.active ?? NO_ENVIRONMENT_LABEL}`;
    this.statusBar.show();
  }
}
