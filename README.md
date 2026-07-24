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

- `.http` / `.rest` files with REST Client-compatible syntax
- File variables, `{{interpolation}}`, `$guid` / `$timestamp` / `$randomInt` /
  `$datetime` system variables
- Environments via `restpad.environmentVariables` (compatible with
  `rest-client.environmentVariables`)
- Response viewer: status, timing, size, pretty-printed JSON, headers
- Request cancellation, timeouts, redirect control (`# @no-redirect`)
- Works fully offline — your requests never touch our servers (we don't have any)

*(Roadmap: request chaining, cookie jar, history, GraphQL, code generation.)*
