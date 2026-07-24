# Parser compatibility gaps

Gaps in `src/parser/httpParser.ts` versus REST Client (`humao.rest-client`)
syntax, surfaced by the corpus in this directory. Ordered by importance for
REST Client compatibility. None of these cause the parser to throw; they parse
to a wrong or lossy result.

Files whose *central* syntax is unsupported live in `known-gaps/` (excluded from
the "request line ⇒ ≥1 request" assertion but still snapshot-tracked).

---

## 2. Request/response handler scripts `> {% … %}` and `< {% … %}` (LOW — dialect)

IntelliJ HTTP Client / httpyac attach pre-request scripts and response handlers
to a request. REST Client itself does **not** support these, so this is a
cross-dialect difference rather than a REST Client-compat gap, but it appears
in the wild. The parser absorbs the script text into the request `body` (or,
for a lone `< {%` line, mis-detects a `bodyFile`).

Corpus (real-world examples): `real-world/microservices-cart.http`,
`real-world/httpx-index.http`.

---

## Fixed

- 2026-07-23: cURL-format requests. A pasted `curl` command as the request
  line is now parsed (via `src/parser/curlParser.ts`) into method/url/headers/
  body, matching REST Client. Supported flags: `-X/--request`, `-H/--header`,
  `-d/--data/--data-raw/--data-ascii/--data-urlencode` (implies POST; joined
  with `&`), `-u/--user` (emits `Authorization: Basic …`), `-I/--head`, plus
  backslash line continuations and shell-like single/double quoting. Corpus:
  `restclient-readme/curl-{simple-get,post-data,multiline,basic-auth}.http`.
- 2026-07-23: encoding-prefixed file body `<@latin1 ./file` → proper
  `bodyFile.encoding`.
- 2026-07-23: multiple `# @prompt` directives → `request.prompts[]`, each with
  name + description.
- 2026-07-23: `x-www-form-urlencoded` `&`-continuation lines joined into a
  single body line (scoped to that content-type, matching REST Client).
