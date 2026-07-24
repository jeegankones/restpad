import type { LicenseState, ProFeature } from "./types";

/**
 * Offline grace: once a key validated online, Pro features keep working this
 * long without reaching the backend. Fail open for availability (network
 * trouble never locks a paying user out mid-work), fail closed on expiry.
 */
export const OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

/** How often to revalidate in the background while online. */
export const REVALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function isProEnabled(
  state: LicenseState,
  now: number = Date.now(),
): boolean {
  if (state.status !== "pro") return false;
  if (state.expiresAt !== undefined && now >= state.expiresAt) return false;
  return now - state.validatedAt < OFFLINE_GRACE_MS;
}

export function isFeatureEnabled(
  _feature: ProFeature,
  state: LicenseState,
  now: number = Date.now(),
): boolean {
  // All Pro features share one tier today; per-feature tiers would branch here.
  return isProEnabled(state, now);
}

/** True when an online revalidation attempt is due. */
export function shouldRevalidate(state: LicenseState, now: number = Date.now()): boolean {
  return state.status === "pro" && now - state.validatedAt >= REVALIDATE_INTERVAL_MS;
}
