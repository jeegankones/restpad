import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  formatDuration,
  formatSize,
  highlightJson,
  isProbablyBinary,
  renderBody,
  statusClass,
} from "./format";

describe("format helpers", () => {
  it("escapes HTML metacharacters", () => {
    expect(escapeHtml(`<script>"&'</script>`)).toBe(
      "&lt;script&gt;&quot;&amp;'&lt;/script&gt;",
    );
  });

  it("formats sizes and durations", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2.0 KB");
    expect(formatSize(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatDuration(250)).toBe("250 ms");
    expect(formatDuration(1500)).toBe("1.50 s");
  });

  it("classifies statuses", () => {
    expect(statusClass(200)).toBe("ok");
    expect(statusClass(302)).toBe("redirect");
    expect(statusClass(404)).toBe("client-error");
    expect(statusClass(503)).toBe("server-error");
  });
});

describe("highlightJson", () => {
  it("wraps keys, strings, numbers, and keywords in token spans", () => {
    const html = highlightJson('{\n  "name": "Ada",\n  "age": 36,\n  "admin": true\n}');
    expect(html).toContain('<span class="tok-key">&quot;name&quot;</span>:');
    expect(html).toContain('<span class="tok-str">&quot;Ada&quot;</span>');
    expect(html).toContain('<span class="tok-num">36</span>');
    expect(html).toContain('<span class="tok-bool">true</span>');
  });

  it("escapes HTML inside string values (XSS)", () => {
    const html = highlightJson('{\n  "x": "<img src=x onerror=alert(1)>"\n}');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("renderBody", () => {
  it("pretty-prints and labels JSON", () => {
    const rendering = renderBody(Buffer.from('{"a":1}'), "application/json");
    expect(rendering.label).toBe("JSON");
    expect(rendering.html).toContain("tok-key");
  });

  it("falls back to text for invalid JSON", () => {
    const rendering = renderBody(Buffer.from("not json"), "application/json");
    expect(rendering.label).toBe("Text");
    expect(rendering.html).toContain("not json");
  });

  it("escapes HTML responses instead of rendering them", () => {
    const rendering = renderBody(Buffer.from("<script>alert(1)</script>"), "text/html");
    expect(rendering.label).toBe("HTML");
    expect(rendering.html).not.toContain("<script>alert");
    expect(rendering.html).toContain("&lt;script&gt;");
  });

  it("shows a summary for binary bodies", () => {
    const rendering = renderBody(Buffer.alloc(2048), "application/octet-stream");
    expect(rendering.label).toBe("Binary");
    expect(rendering.html).toContain("2.0 KB");
  });

  it("shows an empty-body state", () => {
    expect(renderBody(Buffer.alloc(0), "").html).toContain("Empty response body");
  });
});

describe("isProbablyBinary", () => {
  it("detects null bytes and control-character density", () => {
    expect(isProbablyBinary(Buffer.from([0x00, 0x01]))).toBe(true);
    expect(isProbablyBinary(Buffer.from("plain text"))).toBe(false);
  });
});
