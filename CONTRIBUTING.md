# Contributing to Restpad

Contributions are welcome. Restpad is MIT licensed, so feel free to fork it,
modify it, or ship your own thing based on it.

A note on maintenance expectations, so nobody's time gets wasted: this is a
side project, not a funded product. Issues and PRs get looked at in batches
rather than immediately. If something matters to you and you don't hear back,
a ping is fine, and forking is always a legitimate option.

## Getting set up

```bash
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest, unit + corpus + performance
npm run build         # esbuild bundle -> dist/extension.js
```

Press <kbd>F5</kbd> in VS Code to launch the Extension Development Host, then
open `examples/demo.http` to try things out.

Integration tests download a real VS Code build and drive it:

```bash
npm run test:integration
```

## Project layout

| Path                 | What's in it                                                |
| -------------------- | ----------------------------------------------------------- |
| `src/parser/`        | `.http` and `curl` parsing. **Pure — no I/O, no `vscode` imports.** |
| `src/engine/`        | HTTP execution (`undici`) and the cookie jar                |
| `src/variables/`     | Variable resolution, request chaining, response store       |
| `src/environments/`  | Environment management, `$shared` merge, `.env` loading      |
| `src/runner/`        | Send All / sequential execution                             |
| `src/ui/`            | Response webview and formatting                             |
| `src/history/`       | Session request history                                     |
| `test/corpus/`       | Real-world `.http` files used as a compatibility corpus      |

Keeping the parser free of `vscode` imports is deliberate: it makes it
trivially unit-testable and keeps the option of publishing it standalone.

## Guidelines

- **Match the surrounding code.** No new dependencies without a good reason;
  the only runtime dependency is `undici`, and keeping activation fast matters.
- **Add tests.** Parser and resolver changes especially. If you're fixing a
  compatibility bug, add the offending `.http` file to `test/corpus/`.
- **Don't break REST Client compatibility.** That's the whole point of the
  project. The corpus test is the guard rail; it must stay at 100%.
- A pre-push hook runs `typecheck` + unit tests. Please don't skip it.

## Reporting bugs

Include the `.http` snippet that reproduces it (redact secrets, obviously),
your VS Code version, and your OS. A failing corpus file is the most useful
bug report possible.

## Security

Restpad sends requests only to the hosts in your own files and has no
telemetry, no accounts, and no network calls of its own. If you find something
that contradicts that, please open an issue.
