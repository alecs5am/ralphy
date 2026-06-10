// Integration test for `ralphy ref pull-site <url> --project <id>` (#014).
// Spins up a localhost HTTP fixture serving a tiny fake brand site
// (home + /docs + /pricing + /sitemap.xml) and dispatches the CLI at it.
// No live network calls — everything stays on 127.0.0.1.

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

// Skip when the Chromium binary isn't available — required for the Playwright
// crawl. CI installs it via `bunx playwright install chromium`.
const CHROMIUM_DIR = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
const HAS_CHROMIUM = (() => {
  try {
    if (!fs.existsSync(CHROMIUM_DIR)) return false;
    return fs.readdirSync(CHROMIUM_DIR).some((d) => d.startsWith("chromium-"));
  } catch {
    return false;
  }
})();

let server: Server;
let port = 0;
let tmpRoot: string;

const HOME_HTML = `<!doctype html>
<html>
<head>
  <title>ACME OCR — Online PDF parser</title>
  <style>
    :root { --brand-primary: #3B82F6; --brand-bg: #FFFFFF; --brand-fg: #0F172A; }
    body { background: var(--brand-bg); color: var(--brand-fg); font-family: Inter, system-ui, sans-serif; margin: 0; }
    .hero { padding: 80px; }
    .cta { background: #3B82F6; color: #fff; padding: 12px 24px; }
  </style>
</head>
<body>
  <header><a href="/">Home</a> <a href="/docs">Docs</a> <a href="/pricing">Pricing</a></header>
  <section class="hero">
    <h1>Online PDF recognition for AI agents</h1>
    <p>95% accuracy at $0.003 per page.</p>
    <pre><code>curl -X POST https://acme-ocr.example/v1/extract -H "Authorization: Bearer YOUR_API_KEY" -F "file=@doc.pdf"</code></pre>
    <a class="cta" href="/signup">Try it free</a>
  </section>
</body>
</html>`;

const DOCS_HTML = `<!doctype html>
<html>
<head><title>Docs — ACME OCR</title></head>
<body>
  <h1>API Reference</h1>
  <h2>Authentication</h2>
  <pre><code class="lang-bash">curl -X POST https://acme-ocr.example/v1/extract \\
  -H "Authorization: Bearer YOUR_API_KEY"</code></pre>

  <h2>Python</h2>
  <pre><code class="lang-python">import requests
requests.post('https://acme-ocr.example/v1/extract', headers={'Authorization': 'Bearer ...'})</code></pre>

  <p>Install via <code>pip install requests</code>.</p>
</body>
</html>`;

const PRICING_HTML = `<!doctype html>
<html>
<head><title>Pricing — ACME OCR</title></head>
<body>
  <h1>Pricing</h1>
  <p>$0.003 per page — no setup fee.</p>
</body>
</html>`;

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>http://127.0.0.1:__PORT__/</loc></url>
  <url><loc>http://127.0.0.1:__PORT__/docs</loc></url>
  <url><loc>http://127.0.0.1:__PORT__/pricing</loc></url>
</urlset>`;

beforeAll(() => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(HOME_HTML);
      return;
    }
    if (url === "/docs" || url === "/docs/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(DOCS_HTML);
      return;
    }
    if (url === "/pricing" || url === "/pricing/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PRICING_HTML);
      return;
    }
    if (url === "/sitemap.xml") {
      res.writeHead(200, { "content-type": "application/xml; charset=utf-8" });
      res.end(SITEMAP_XML.replace(/__PORT__/g, String(port)));
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  return new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) port = addr.port;
      resolve();
    });
  });
});

afterAll(() => {
  return new Promise<void>((resolve) => server.close(() => resolve()));
});

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: any } {
  const r = spawnSync("bun", [CLI, "--cwd", tmpRoot, ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    env: { ...process.env },
    // Give the crawl a generous wall-clock — Chromium startup is ~1-2s on macOS,
    // plus the per-page navigations.
    timeout: 60_000,
  });
  let json: any = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not json */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-pull-site-"));
  fs.mkdirSync(path.join(tmpRoot, "workspace", ".ralph"), { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, "workspace", "projects", "test-site-001"), { recursive: true });
  const registry = {
    projects: {
      "test-site-001": {
        id: "test-site-001",
        name: "Site grounding fixture",
        brief: "test",
        refs: [],
      },
    },
    refs: {},
    brands: {},
    personas: {},
    templates: {},
    batches: {},
  };
  fs.writeFileSync(
    path.join(tmpRoot, "workspace", ".ralph", "registry.json"),
    JSON.stringify(registry, null, 2),
  );
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

describe("`ralphy ref pull-site` (#014)", () => {
  test.skipIf(!HAS_CHROMIUM)(
    "writes hero PNG + per-page PNG + tokens.json + apis.md into <project>/artifacts/refs/",
    () => {
      // Playwright cold-start under full-suite load can exceed the bun default
      // 5s per-test timeout; pre-push hook does not pass --timeout. Bump.
      const r = ralphy([
        "ref",
        "pull-site",
        `http://127.0.0.1:${port}/`,
        "--project",
        "test-site-001",
        "--depth",
        "4",
      ]);
      if (r.exitCode !== 0) {
        console.error("stderr:", r.stderr);
        console.error("stdout:", r.stdout);
      }
      expect(r.exitCode).toBe(0);
      expect(r.json).not.toBeNull();
      expect(r.json.pages.length).toBeGreaterThanOrEqual(1);

      const refsDir = path.join(tmpRoot, "workspace", "projects", "test-site-001", "artifacts", "refs");
      const files = fs.readdirSync(refsDir);

      // Home screenshot.
      expect(files.some((f) => /^127\.0\.0\.1.*home\.png$/.test(f))).toBe(true);
      // Tokens.
      expect(files.some((f) => /-tokens\.json$/.test(f))).toBe(true);
      // APIs report.
      expect(files.some((f) => /-apis\.md$/.test(f))).toBe(true);

      const tokensFile = files.find((f) => /-tokens\.json$/.test(f))!;
      const tokens = JSON.parse(fs.readFileSync(path.join(refsDir, tokensFile), "utf8"));
      expect(Array.isArray(tokens.colors)).toBe(true);
      // The fixture sets :root --brand-primary: #3B82F6 → tokens must capture it.
      expect(tokens.colors.join(",").toLowerCase()).toContain("#3b82f6");
      // The fixture's font-family declares Inter.
      expect((tokens.fonts as string[]).map((s) => s.toLowerCase()).join(",")).toContain("inter");

      const apisFile = files.find((f) => /-apis\.md$/.test(f))!;
      const apisMd = fs.readFileSync(path.join(refsDir, apisFile), "utf8");
      // curl signature in home + docs.
      expect(apisMd.toLowerCase()).toContain("curl");
    },
    30_000,
  );

  test.skipIf(!HAS_CHROMIUM)("appends a gen-log row with provider='playwright' for each page", () => {
    ralphy([
      "ref",
      "pull-site",
      `http://127.0.0.1:${port}/`,
      "--project",
      "test-site-001",
      "--depth",
      "2",
    ]);
    const log = path.join(
      tmpRoot,
      "workspace",
      "projects",
      "test-site-001",
      "logs",
      "generations.jsonl",
    );
    expect(fs.existsSync(log)).toBe(true);
    const rows = fs
      .readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const siteRows = rows.filter((r: any) => r.endpoint === "ref-pull-site");
    expect(siteRows.length).toBeGreaterThanOrEqual(1);
    const last = siteRows[siteRows.length - 1];
    expect(last.provider).toBe("playwright");
    expect(last.cost_usd).toBe(0);
    expect(last.input.project).toBe("test-site-001");
    expect(last.input.kind_hint).toBe("reference-website");
  }, 30_000);

  test("missing project raises E_NOT_FOUND with a clean exit code", () => {
    const r = ralphy([
      "ref",
      "pull-site",
      `http://127.0.0.1:${port}/`,
      "--project",
      "nope-does-not-exist",
    ]);
    expect(r.exitCode).not.toBe(0);
    expect((r.stdout + r.stderr).toLowerCase()).toContain("project");
  });
});
