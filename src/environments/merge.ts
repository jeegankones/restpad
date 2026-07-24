/** Shared-variables key in `restpad.environmentVariables` (REST Client compat). */
export const SHARED_KEY = "$shared";

export type EnvironmentConfig = Record<string, Record<string, string>>;

/** Names of switchable environments (everything except $shared). */
export function environmentNames(config: EnvironmentConfig): string[] {
  return Object.keys(config).filter((name) => name !== SHARED_KEY);
}

/**
 * Merge $shared with the active environment; active values win.
 * With no active environment only $shared applies.
 */
export function mergeEnvironment(
  config: EnvironmentConfig,
  active: string | undefined,
): Record<string, string> {
  const shared = config[SHARED_KEY] ?? {};
  const activeVariables = active ? (config[active] ?? {}) : {};
  return { ...shared, ...activeVariables };
}
