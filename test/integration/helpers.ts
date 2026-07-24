/**
 * Poll `predicate` until it returns true or the timeout elapses. Used instead
 * of fixed sleeps so tests stay robust to VS Code / request timing.
 */
export async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  { timeoutMs = 15_000, intervalMs = 100, message = "condition" } = {},
): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await predicate()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${message}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
