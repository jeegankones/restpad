import type { ResponseData } from "../engine/client";
import type { ResolvedRequest } from "./resolver";

/**
 * One saved execution of a `# @name`d request: the request as it was actually
 * sent (after variable resolution) plus the response it produced.
 */
export interface StoredResponse {
  request: ResolvedRequest;
  response: ResponseData;
}

/**
 * In-memory store mapping a request name to the most recent execution of that
 * request. Enables REST Client "Request Variables", referencing a previous
 * named response like `{{login.response.body.$.token}}`.
 *
 * Pure and free of vscode dependencies so it can be unit-tested and shared
 * across an extension activation. Later executions of the same name overwrite
 * earlier ones, matching REST Client's "most recent wins" behaviour.
 */
export class ResponseStore {
  private readonly entries = new Map<string, StoredResponse>();

  /** Record (or overwrite) the latest execution for `name`. */
  save(name: string, entry: StoredResponse): void {
    this.entries.set(name, entry);
  }

  /** The latest stored execution for `name`, if any. */
  get(name: string): StoredResponse | undefined {
    return this.entries.get(name);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  clear(): void {
    this.entries.clear();
  }
}
