import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Local HTTP fixture server for E2E tests. No external network in tests.
 *
 * Routes:
 *   ANY  /echo          → JSON { method, url, headers, body }
 *   GET  /json          → { "hello": "world" }
 *   GET  /status/:code  → empty body with that status
 *   GET  /redirect/:n   → 302-chain n hops, ends at /json
 *   GET  /redirect-303  → 303 → /echo
 *   GET  /slow/:ms      → responds after ms
 *   GET  /large/:kb     → kb kilobytes of "x"
 *   GET  /binary        → 1KB of null bytes, content-type application/octet-stream
 */
export class FixtureServer {
  private server: Server | undefined;
  baseUrl = "";

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      void this.route(request, response);
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server ? this.server.close((e) => (e ? reject(e) : resolve())) : resolve(),
    );
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", this.baseUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const [head, arg] = segments;

    switch (head) {
      case "echo": {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk as Buffer);
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            method: request.method,
            url: request.url,
            headers: request.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        return;
      }
      case "json":
        response.setHeader("content-type", "application/json");
        response.end('{"hello":"world"}');
        return;
      case "status":
        response.statusCode = Number(arg ?? 200);
        response.end();
        return;
      case "redirect": {
        const hops = Number(arg ?? 1);
        response.statusCode = 302;
        response.setHeader("location", hops > 1 ? `/redirect/${hops - 1}` : "/json");
        response.end();
        return;
      }
      case "redirect-303":
        response.statusCode = 303;
        response.setHeader("location", "/echo");
        response.end();
        return;
      case "slow":
        setTimeout(() => response.end("finally"), Number(arg ?? 1000));
        return;
      case "large":
        response.end("x".repeat(Number(arg ?? 1) * 1024));
        return;
      case "binary":
        response.setHeader("content-type", "application/octet-stream");
        response.end(Buffer.alloc(1024));
        return;
      default:
        response.statusCode = 404;
        response.end("not found");
    }
  }
}
