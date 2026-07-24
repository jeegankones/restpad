import * as vscode from "vscode";
import { isProEnabled, shouldRevalidate } from "./gate";
import { MockValidator } from "./polarValidator";
import type { LicenseState, LicenseValidator, ProFeature } from "./types";
import { isFeatureEnabled } from "./gate";

const SECRET_KEY = "restpad.licenseKey";
const STATE_KEY = "restpad.licenseState";

/**
 * Holds license state: key in SecretStorage, validation metadata in
 * globalState. Uses MockValidator (always invalid) until the Polar account
 * exists — entering a key today reports "not yet available" honestly.
 */
export class LicenseManager {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly validator: LicenseValidator = new MockValidator({
      valid: false,
      reason: "Restpad Pro is not available yet — licensing opens at launch.",
    }),
  ) {}

  register(): vscode.Disposable[] {
    return [
      vscode.commands.registerCommand("restpad.enterLicenseKey", () => this.enterKey()),
      vscode.commands.registerCommand("restpad.clearLicenseKey", () => this.clearKey()),
    ];
  }

  state(): LicenseState {
    return this.context.globalState.get<LicenseState>(STATE_KEY) ?? { status: "free" };
  }

  isPro(): boolean {
    return isProEnabled(this.state());
  }

  featureEnabled(feature: ProFeature): boolean {
    return isFeatureEnabled(feature, this.state());
  }

  /** Revalidate in the background if due; network failures keep prior state. */
  async revalidateIfDue(): Promise<void> {
    const state = this.state();
    if (!shouldRevalidate(state) || state.status !== "pro") return;
    try {
      const result = await this.validator.validate(state.key);
      await this.setState(
        result.valid
          ? { ...state, validatedAt: Date.now(), expiresAt: result.expiresAt }
          : { status: "free" },
      );
    } catch {
      // Offline or backend down: offline grace in the gate handles it.
    }
  }

  private async enterKey(): Promise<void> {
    const key = await vscode.window.showInputBox({
      title: "Restpad Pro license key",
      prompt: "Paste your license key",
      password: true,
      ignoreFocusOut: true,
    });
    if (!key) return;
    try {
      const result = await this.validator.validate(key.trim());
      if (!result.valid) {
        void vscode.window.showWarningMessage(
          `Restpad: license not activated. ${result.reason ?? ""}`.trim(),
        );
        return;
      }
      await this.context.secrets.store(SECRET_KEY, key.trim());
      await this.setState({
        status: "pro",
        key: key.trim(),
        validatedAt: Date.now(),
        expiresAt: result.expiresAt,
      });
      void vscode.window.showInformationMessage("Restpad Pro activated — thank you!");
    } catch {
      void vscode.window.showErrorMessage(
        "Restpad: could not reach the license server. Check your connection and try again.",
      );
    }
  }

  private async clearKey(): Promise<void> {
    await this.context.secrets.delete(SECRET_KEY);
    await this.setState({ status: "free" });
    void vscode.window.showInformationMessage("Restpad: license removed.");
  }

  private async setState(state: LicenseState): Promise<void> {
    await this.context.globalState.update(STATE_KEY, state);
  }
}
