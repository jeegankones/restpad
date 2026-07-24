# Restpad — Test Strategy

"Thoroughly tested in every sense": correctness, compatibility, performance,
UX, and cross-platform. A milestone is not done until its layer here is green.

## Layers

1. **Unit (vitest)** — parser, variable resolver, engine helpers. Pure
   modules, no vscode imports. Target: every syntax rule and edge case has a
   test. Runs in CI on every push.
2. **Compatibility corpus** (`test/corpus/`) — real-world `.http` files
   harvested from public repos + every example in REST Client's README.
   Snapshot-tested: parser output reviewed once, then locked. This is the
   migration guarantee for REST Client users.
3. **Integration (@vscode/test-electron)** — extension activates, CodeLens
   appears, sendRequest command round-trips against a **local fixture server**
   (no external network in tests). Runs on ubuntu/macos/windows in CI.
4. **E2E fixture server** (`test/server/`) — local HTTP server with routes for
   echo, JSON, redirects (all 3xx variants), slow responses (timeout tests),
   large bodies (10MB), binary, gzip, chunked, cookies, every status code.
5. **Performance budgets** — parse 1,000-request file < 100ms; extension
   activation < 50ms; response render of 5MB JSON without freezing the
   extension host. Enforced as tests, not aspirations.
6. **UX audits** — periodic pass against VS Code UX guidelines (theming in
   light/dark/high-contrast, keyboard-only operation, screen-reader labels on
   webview). Manual smoke via Extension Development Host with a scripted
   checklist in `test/UX_CHECKLIST.md`.
7. **Security** — webview CSP locked down; HTML-escape all response content
   (responses are attacker-controlled input); no secrets written to logs or
   history files; license checks fail open for availability, closed for tamper.

## Definition of stable (pre-publish gate)

- CI green on 3 OSes for 2 consecutive weeks of iterations
- Corpus: 100% of collected files parse without error
- Zero unhandled promise rejections under the E2E suite
- Manual UX checklist passed in Extension Development Host
