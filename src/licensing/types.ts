/**
 * Licensing model. Free features never pass through this module — only Pro
 * features are gated, so a licensing bug can never break the free tier.
 */

export type ProFeature =
  | "graphql"
  | "codegen"
  | "streaming" // WebSocket / SSE / gRPC
  | "cli"
  | "secrets-vault"
  | "team-sync";

export type LicenseState =
  | { status: "free" }
  | {
      status: "pro";
      key: string;
      /** Epoch ms of the last successful online validation. */
      validatedAt: number;
      /** Epoch ms subscription/license expiry reported by the backend, if any. */
      expiresAt?: number;
    };

export interface ValidationResult {
  valid: boolean;
  /** Present when valid; epoch ms. */
  expiresAt?: number;
  /** Human-readable reason when invalid (shown to the user). */
  reason?: string;
}

export interface LicenseValidator {
  /** Validate a license key against the backend. Throws only on network failure. */
  validate(key: string): Promise<ValidationResult>;
}
