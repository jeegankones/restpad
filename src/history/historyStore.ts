import type { ResponseData } from "../engine/client";
import type { ResolvedRequest } from "../variables/resolver";

export interface HistoryEntry {
  request: ResolvedRequest;
  response: ResponseData;
  /** Epoch ms when the response arrived. */
  at: number;
}

/**
 * In-memory ring of recent request/response pairs, newest first.
 * Session-scoped; persistence is a deliberate non-goal until there is
 * evidence users want history to survive reloads.
 */
export class HistoryStore {
  private entries: HistoryEntry[] = [];

  constructor(private readonly capacity = 50) {}

  push(request: ResolvedRequest, response: ResponseData, at = Date.now()): void {
    this.entries.unshift({ request, response, at });
    if (this.entries.length > this.capacity) {
      this.entries.length = this.capacity;
    }
  }

  /** Newest first. */
  list(): readonly HistoryEntry[] {
    return this.entries;
  }

  latest(): HistoryEntry | undefined {
    return this.entries[0];
  }

  clear(): void {
    this.entries = [];
  }
}
