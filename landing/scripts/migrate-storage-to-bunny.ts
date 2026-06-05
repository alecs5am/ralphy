// landing/scripts/migrate-storage-to-bunny.ts
//
// One-shot migration: copy every object in the Supabase `library` Storage bucket
// into the Bunny Storage Zone (same path layout), so the public site can serve
// media from Bunny's CDN (ralphy.b-cdn.net) instead of Supabase Storage egress.
//
//   Supabase object key:  <key>                (under bucket `library`)
//   Public Supabase URL:  <SUPABASE_URL>/storage/v1/object/public/library/<key>
//   Bunny storage path:   ralphy/<key>
//   Public Bunny URL:     https://ralphy.b-cdn.net/<key>
//
// Idempotent: re-running re-uploads (Bunny PUT overwrites). Secrets are read from
// the environment at runtime only (run with `bun --env-file=.env.local`). Nothing
// is deleted here — the Supabase cleanup is a separate, explicit step.
//
// Usage:
//   bun --env-file=.env.local scripts/migrate-storage-to-bunny.ts            # migrate
//   bun --env-file=.env.local scripts/migrate-storage-to-bunny.ts --verify   # verify only (HEAD parity)

import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const VERIFY_ONLY = process.argv.includes("--verify");
const CONCURRENCY = 8;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "library";
const BUNNY_HOST = env("BUNNY_STORAGE_HOST"); // storage.bunnycdn.com (region DE)
const BUNNY_ZONE = env("BUNNY_STORAGE_ZONE"); // ralphy
const BUNNY_PASS = env("BUNNY_STORAGE_PASSWORD");
const CDN_BASE = env("BUNNY_CDN_BASE").replace(/\/$/, ""); // https://ralphy.b-cdn.net

const s3 = new S3Client({
  endpoint: env("SUPABASE_S3_ENDPOINT"),
  region: env("SUPABASE_S3_REGION"),
  forcePathStyle: true,
  credentials: {
    accessKeyId: env("SUPABASE_S3_ACCESS_KEY_ID"),
    secretAccessKey: env("SUPABASE_S3_SECRET_ACCESS_KEY"),
  },
});

async function listAllKeys(): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const out = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token, MaxKeys: 1000 }),
    );
    for (const o of out.Contents ?? []) {
      if (o.Key && !o.Key.endsWith("/") && (o.Size ?? 0) > 0) keys.push(o.Key);
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  return keys.sort();
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  // AWS SDK v3 Node stream
  const chunks: Buffer[] = [];
  const stream = body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function contentTypeFor(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", svg: "image/svg+xml", mp3: "audio/mpeg", wav: "audio/wav",
    html: "text/html", json: "application/json", srt: "application/x-subrip",
  };
  return map[ext] ?? "application/octet-stream";
}

async function bunnyPut(key: string, body: Buffer): Promise<void> {
  const url = `https://${BUNNY_HOST}/${BUNNY_ZONE}/${key}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { AccessKey: BUNNY_PASS, "Content-Type": contentTypeFor(key) },
    body,
  });
  if (!res.ok) {
    throw new Error(`Bunny PUT ${key} → HTTP ${res.status} ${await res.text().catch(() => "")}`);
  }
}

// Presence check via the public CDN. A 200 means the object exists in the
// storage zone and the pull zone can serve it. We do NOT gate on content-length:
// Bunny gzips text (.txt/.json/.html) and serves it chunked, so HEAD carries no
// content-length even though the file is present.
async function bunnyPresent(key: string): Promise<boolean> {
  const res = await fetch(`${CDN_BASE}/${key}`, { method: "HEAD" });
  return res.ok;
}

async function mapPool<T>(items: T[], n: number, fn: (it: T, i: number) => Promise<void>) {
  let idx = 0;
  let done = 0;
  const total = items.length;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
      done++;
      if (done % 25 === 0 || done === total) console.log(`  …${done}/${total}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

async function main() {
  console.log(`Listing objects in Supabase bucket "${BUCKET}"…`);
  const keys = await listAllKeys();
  let totalBytes = 0;
  console.log(`Found ${keys.length} objects.`);

  if (VERIFY_ONLY) {
    let ok = 0;
    const missing: string[] = [];
    await mapPool(keys, CONCURRENCY, async (key) => {
      if (await bunnyPresent(key)) ok++;
      else missing.push(key);
    });
    console.log(`\nVERIFY: ${ok}/${keys.length} present on Bunny CDN.`);
    if (missing.length) {
      console.log(`MISSING (${missing.length}):`);
      missing.slice(0, 50).forEach((k) => console.log(`  - ${k}`));
      process.exit(1);
    }
    console.log("All objects present on Bunny. ✓");
    return;
  }

  const failures: { key: string; err: string }[] = [];
  await mapPool(keys, CONCURRENCY, async (key) => {
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      const buf = await streamToBuffer(obj.Body);
      totalBytes += buf.length;
      await bunnyPut(key, buf);
    } catch (e) {
      failures.push({ key, err: String(e) });
    }
  });

  console.log(`\nUploaded ${keys.length - failures.length}/${keys.length} objects (${(totalBytes / 1e6).toFixed(1)} MB) to Bunny zone "${BUNNY_ZONE}".`);
  if (failures.length) {
    console.log(`FAILURES (${failures.length}):`);
    failures.forEach((f) => console.log(`  - ${f.key}: ${f.err}`));
    process.exit(1);
  }
  console.log("Migration complete. ✓  Run with --verify to confirm CDN parity.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
