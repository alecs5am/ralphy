// landing/scripts/cleanup-supabase-storage.ts
//
// FINAL, DESTRUCTIVE step of the Bunny migration: delete every object in the
// Supabase `library` Storage bucket to stop the egress overage. Postgres is
// untouched — this only empties the Storage bucket.
//
// Run ONLY after the Bunny CDN is verified serving in production (645/645
// present on ralphy.b-cdn.net AND the live site loads media from b-cdn.net).
//
// Usage:
//   bun --env-file=.env.local scripts/cleanup-supabase-storage.ts --dry-run   # list what would be deleted
//   bun --env-file=.env.local scripts/cleanup-supabase-storage.ts --confirm-delete

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

const CONFIRM = process.argv.includes("--confirm-delete");

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "library";
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
    for (const o of out.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function main() {
  const keys = await listAllKeys();
  console.log(`Supabase bucket "${BUCKET}" holds ${keys.length} objects.`);
  if (!CONFIRM) {
    console.log("[dry-run] Would delete all of them. Re-run with --confirm-delete to proceed.");
    keys.slice(0, 10).forEach((k) => console.log(`  - ${k}`));
    if (keys.length > 10) console.log(`  … and ${keys.length - 10} more`);
    return;
  }
  // S3 DeleteObjects takes up to 1000 keys per call.
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    const out = await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    deleted += batch.length - (out.Errors?.length ?? 0);
    if (out.Errors?.length) {
      console.log(`  ${out.Errors.length} errors in batch ${i / 1000}:`);
      out.Errors.slice(0, 5).forEach((e) => console.log(`    - ${e.Key}: ${e.Message}`));
    }
  }
  const remaining = (await listAllKeys()).length;
  console.log(`Deleted ${deleted} objects. Remaining in bucket: ${remaining} (target 0).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
