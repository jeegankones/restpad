import type { LicenseValidator, ValidationResult } from "./types";

/**
 * License validation against Polar.sh's license-key API.
 *
 * NOTE: the organization id is not yet real — the Polar account is a human
 * blocker. The endpoint shape follows Polar's documented
 * customer-portal license-key API; re-verify request/response fields against
 * the live docs at M4 before enabling. Until then, tests use MockValidator.
 */
export class PolarValidator implements LicenseValidator {
  constructor(
    private readonly organizationId: string,
    private readonly baseUrl = "https://api.polar.sh/v1",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async validate(key: string): Promise<ValidationResult> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/customer-portal/license-keys/validate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, organization_id: this.organizationId }),
      },
    );

    if (response.status === 404) {
      return { valid: false, reason: "License key not found." };
    }
    if (!response.ok) {
      // 4xx other than not-found: treat as invalid with detail; 5xx: throw so
      // the caller keeps the previous state (offline grace applies).
      if (response.status >= 500) {
        throw new Error(`Polar validation unavailable (HTTP ${response.status})`);
      }
      return { valid: false, reason: `License validation failed (HTTP ${response.status}).` };
    }

    const data = (await response.json()) as {
      expires_at?: string | null;
      status?: string;
    };
    if (data.status && data.status !== "granted" && data.status !== "active") {
      return { valid: false, reason: `License is ${data.status}.` };
    }
    return {
      valid: true,
      expiresAt: data.expires_at ? Date.parse(data.expires_at) : undefined,
    };
  }
}

/** Deterministic validator for tests and for development before Polar exists. */
export class MockValidator implements LicenseValidator {
  constructor(private readonly result: ValidationResult) {}
  async validate(): Promise<ValidationResult> {
    return this.result;
  }
}
