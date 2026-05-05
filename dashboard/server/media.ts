import { Hono } from "hono";
import fs from "fs/promises";
import { createReadStream, statSync } from "fs";
import path from "path";
import { stream } from "hono/streaming";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aiff": "audio/aiff",
  ".ogg": "audio/ogg",
  ".srt": "text/plain",
  ".json": "application/json",
};

export function createMediaHandler(projectRoot: string) {
  const app = new Hono();

  app.get("/*", async (c) => {
    const relativePath = c.req.path.replace(/^\/media\//, "");
    const filePath = path.join(projectRoot, relativePath);

    // Security: prevent directory traversal
    if (!filePath.startsWith(projectRoot)) {
      return c.json({ error: "forbidden" }, 403);
    }

    try {
      const stat = statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      // Handle range requests for video/audio seeking
      const range = c.req.header("range");
      if (range && (contentType.startsWith("video/") || contentType.startsWith("audio/"))) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = end - start + 1;

        c.header("Content-Range", `bytes ${start}-${end}/${stat.size}`);
        c.header("Accept-Ranges", "bytes");
        c.header("Content-Length", String(chunkSize));
        c.header("Content-Type", contentType);
        c.status(206);

        return stream(c, async (s) => {
          const readable = createReadStream(filePath, { start, end });
          for await (const chunk of readable) {
            await s.write(chunk as Uint8Array);
          }
        });
      }

      c.header("Content-Type", contentType);
      c.header("Content-Length", String(stat.size));
      c.header("Accept-Ranges", "bytes");
      c.header("Cache-Control", "no-cache");

      return stream(c, async (s) => {
        const readable = createReadStream(filePath);
        for await (const chunk of readable) {
          await s.write(chunk as Uint8Array);
        }
      });
    } catch {
      return c.json({ error: "not found" }, 404);
    }
  });

  return app;
}
