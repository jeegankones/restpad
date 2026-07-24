import type { ExecuteOptions, ResponseData } from "../engine/client";
import type { HttpFile, HttpRequest } from "../parser/httpParser";
import type { ResolveContext, ResolvedRequest } from "../variables/resolver";
import { resolveRequest } from "../variables/resolver";

export interface RunResult {
  request: HttpRequest;
  resolved: ResolvedRequest;
  /** Present on success. */
  response?: ResponseData;
  /** Present on failure (network error, timeout). */
  error?: Error;
}

export type Executor = (
  resolved: ResolvedRequest,
  options: ExecuteOptions,
) => Promise<ResponseData>;

/**
 * Run every request in the file sequentially, top to bottom. Named requests
 * populate the response store as they complete, so chained references to
 * earlier requests resolve naturally. Failures are recorded and execution
 * continues — a run-all is a smoke pass, not a transaction.
 */
export async function runAll(
  file: HttpFile,
  baseContext: ResolveContext,
  execute: Executor,
  options: ExecuteOptions,
  onProgress?: (completed: number, total: number, latest: RunResult) => void,
): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (const request of file.requests) {
    if (options.signal?.aborted) break;
    // Resolve lazily per request: earlier named responses are visible.
    const resolved = resolveRequest(request, baseContext);
    const result: RunResult = { request, resolved };
    try {
      const response = await execute(resolved, options);
      result.response = response;
      if (request.name) {
        baseContext.responses?.save(request.name, { request: resolved, response });
      }
    } catch (error) {
      if (options.signal?.aborted) break;
      result.error = error instanceof Error ? error : new Error(String(error));
    }
    results.push(result);
    onProgress?.(results.length, file.requests.length, result);
  }
  return results;
}
