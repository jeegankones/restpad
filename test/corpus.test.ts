import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHttpFile } from "../src/parser/httpParser";

const here = dirname(fileURLToPath(import.meta.url));
const corpusRoot = join(here, "corpus");

/** Recursively collect every *.http file under `dir`. */
function collectHttpFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectHttpFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".http")) out.push(full);
  }
  return out.sort();
}

/**
 * Independent (parser-agnostic) detector for whether a file contains at least
 * one REST Client "request line": a line that is either `METHOD url` or a bare
 * URL. Used to catch parser bugs where a request line exists but 0 requests are
 * produced. Deliberately does NOT recognise `curl ...` lines, since those are a
 * documented gap tracked separately.
 */
const REQUEST_LINE_HEURISTIC =
  /^\s*(?:(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT|LOCK|UNLOCK|PROPFIND|PROPPATCH|COPY|MOVE|MKCOL|MKCALENDAR|ACL|SEARCH)\s+\S)|(?:https?:\/\/\S)/im;

function hasRequestLine(text: string): boolean {
  // Ignore separator/comment noise by scanning line-by-line.
  return text
    .split(/\r?\n/)
    .some((line) => REQUEST_LINE_HEURISTIC.test(line) && !/^###/.test(line));
}

const allFiles = collectHttpFiles(corpusRoot);
const knownGap = (f: string) => f.split(/[\\/]/).includes("known-gaps");

describe("corpus: compatibility snapshots", () => {
  it("found corpus files", () => {
    expect(allFiles.length).toBeGreaterThan(0);
  });

  for (const file of allFiles) {
    const rel = relative(corpusRoot, file);
    const text = readFileSync(file, "utf-8");

    describe(rel, () => {
      it("parses without throwing and matches snapshot", () => {
        let result!: ReturnType<typeof parseHttpFile>;
        expect(() => {
          result = parseHttpFile(text);
        }).not.toThrow();
        expect(result).toMatchSnapshot();
      });

      // Files under known-gaps/ are snapshot-tracked but exempt from the
      // "request line implies >= 1 request" guarantee.
      if (!knownGap(file)) {
        it("produces >= 1 request when a request line is present", () => {
          const result = parseHttpFile(text);
          if (hasRequestLine(text)) {
            expect(result.requests.length).toBeGreaterThanOrEqual(1);
          }
        });
      }
    });
  }
});
