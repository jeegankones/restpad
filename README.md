# Restpad — REST API Client for VS Code

Fast, offline REST API client. Open a `.http` file and send requests
instantly. **No account. No cloud sync you didn't ask for. No paywall
surprises.**

> Drop-in compatible with REST Client `.http`/`.rest` syntax — your existing
> files just work.

## Quick start

Create `api.http`:

```http
@baseUrl = https://api.github.com

### Get a user
GET {{baseUrl}}/users/octocat
Accept: application/vnd.github+json

### Create something
POST {{baseUrl}}/example
Content-Type: application/json

{
  "name": "Ada"
}
```

Click **▶ Send Request** above any request (or run *Restpad: Send Request*).

## Features

- `.http` / `.rest` files with REST Client-compatible syntax — existing files
  just work, including pasted `curl` commands
- **Send All**: run every request in a file sequentially, with a pass/fail summary
- **Request chaining**: `{{login.response.body.$.token}}` references to earlier
  responses, headers included
- Environments with a status-bar switcher, `$shared` variables, `.env` files,
  and `$guid` / `$timestamp` / `$randomInt` / `$datetime` / `$processEnv` /
  `$dotenv` system variables (compatible with `rest-client.environmentVariables`)
- Response viewer: status, timing, size, syntax-highlighted JSON, header and
  request tabs, copy button — native to your theme, light/dark/high-contrast
- Session cookie jar (`# @no-cookie-jar` to bypass), redirect control
  (`# @no-redirect`), cancellation, timeouts
- Request history and save-response-to-file
- Works fully offline — your requests never touch our servers (we don't have any)

Try it: open [`examples/demo.http`](examples/demo.http).

*(Roadmap: GraphQL, WebSocket/SSE, code generation.)*
