# Restpad: REST API Client for VS Code

Fast, offline REST API client. Open a `.http` file and send requests
instantly. **Free and open source (MIT). No account. No cloud sync you didn't
ask for. No paid tier.**

> Drop-in compatible with REST Client `.http`/`.rest` syntax. Your existing
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

- `.http` / `.rest` files with REST Client-compatible syntax, including
  pasted `curl` commands
- **Send All**: run every request in a file sequentially, with a pass/fail summary
- **Request chaining**: `{{login.response.body.$.token}}` references to earlier
  responses, headers included
- Environments with a status-bar switcher, `$shared` variables, `.env` files,
  and `$guid` / `$timestamp` / `$randomInt` / `$datetime` / `$processEnv` /
  `$dotenv` system variables (compatible with `rest-client.environmentVariables`)
- Response viewer: status, timing, size, syntax-highlighted JSON, header and
  request tabs, copy button. Matches your theme in light, dark, and
  high-contrast
- Session cookie jar (`# @no-cookie-jar` to bypass), redirect control
  (`# @no-redirect`), cancellation, timeouts
- Request history and save-response-to-file
- Works fully offline. Your requests never touch our servers (we don't have any)

Try it: open [`examples/demo.http`](examples/demo.http).

## Why another one?

[REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)
is loved by millions and hasn't shipped a release since August 2022. Restpad
reads the same `.http` syntax, so your existing files work unchanged. That's the
whole idea.

## Contributing

Bug reports and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for
setup, project layout, and what to test. This is a side project, so issues get
looked at in batches.

## License

[MIT](LICENSE). Fork it, change it, ship it.
