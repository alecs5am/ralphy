// Unit tests for the URL → filename derivation + dedupe-path helpers used by
// `ralphy ref pull <url-list>` (#048).

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { urlToFilename, resolveDestPath, readUrlList } from "../../cli/lib/bulk-fetch.js";

function sha(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

describe("urlToFilename", () => {
  test("strips www. and uses last path segment", () => {
    expect(urlToFilename("https://www.apple.com/v/screenshots/x.jpg")).toBe("apple.com-x.jpg");
  });

  test("uses 'index' for bare hostnames", () => {
    expect(urlToFilename("https://example.com/")).toBe("example.com-index");
  });

  test("strips query strings (URL.pathname already drops them)", () => {
    expect(urlToFilename("https://example.com/foo.png?cache=1")).toBe("example.com-foo.png");
  });

  test("kebabs spaces and uppercase in basename", () => {
    expect(urlToFilename("https://example.com/Some Image FILE.PNG")).toBe(
      "example.com-some-image-file.png",
    );
  });

  test("nested paths use the last segment", () => {
    expect(urlToFilename("https://example.com/a/b/foo.png")).toBe("example.com-foo.png");
  });

  test("handles non-url fallback", () => {
    expect(urlToFilename("not a url at all")).toBe("not-a-url-at-all");
  });

  test("kebabs the host too", () => {
    expect(urlToFilename("https://Sub.Example.COM/foo.jpg")).toBe("sub.example.com-foo.jpg");
  });
});

describe("resolveDestPath", () => {
  test("returns the candidate when file doesn't exist", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bulk-fetch-"));
    try {
      const { dest, existed } = await resolveDestPath(tmp, "x.png", "deadbeef");
      expect(dest).toBe(path.join(tmp, "x.png"));
      expect(existed).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("returns existed=true when sha256 matches existing file", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bulk-fetch-"));
    try {
      const buf = Buffer.from("hello");
      const fileSha = sha(buf);
      fs.writeFileSync(path.join(tmp, "x.png"), buf);
      const { dest, existed } = await resolveDestPath(tmp, "x.png", fileSha);
      expect(dest).toBe(path.join(tmp, "x.png"));
      expect(existed).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("suffixes -2 when name collides with different content", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bulk-fetch-"));
    try {
      fs.writeFileSync(path.join(tmp, "x.png"), Buffer.from("old"));
      const { dest, existed } = await resolveDestPath(tmp, "x.png", sha(Buffer.from("new")));
      expect(dest).toBe(path.join(tmp, "x-2.png"));
      expect(existed).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("keeps bumping past -2, -3 collisions until free", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bulk-fetch-"));
    try {
      fs.writeFileSync(path.join(tmp, "x.png"), Buffer.from("a"));
      fs.writeFileSync(path.join(tmp, "x-2.png"), Buffer.from("b"));
      fs.writeFileSync(path.join(tmp, "x-3.png"), Buffer.from("c"));
      const { dest, existed } = await resolveDestPath(tmp, "x.png", sha(Buffer.from("d")));
      expect(dest).toBe(path.join(tmp, "x-4.png"));
      expect(existed).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("readUrlList", () => {
  test("ignores blank lines and # comments", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bulk-fetch-"));
    try {
      const f = path.join(tmp, "urls.txt");
      fs.writeFileSync(
        f,
        `# heading\nhttps://a.com/1.png\n\nhttps://b.com/2.jpg\n  # indented comment is NOT stripped (matches '#' after trim)\n# another\n`,
      );
      const urls = await readUrlList(f);
      expect(urls).toEqual(["https://a.com/1.png", "https://b.com/2.jpg"]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
