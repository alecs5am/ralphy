// landing/scripts/lib/supabase.ts
//
// Shared Supabase helpers for the seed + publish scripts (issue #056). Factors
// the S3 client, env access, content-type guess, and public-URL derivation out
// of seed-supabase.ts so publish-entity.ts reuses the exact same wiring.
//
// Secrets are read from the environment at RUNTIME only — never printed, never
// hardcoded. The Storage bucket is `library`; the pooled Postgres DSN is
// SUPABASE_DB_URL (used by the `pg` client in publish-entity.ts).

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/** Read an env var, returning undefined for unset / empty. Never logs the value. */
export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

/** The Storage bucket name (default `library`). */
export function storageBucket(): string {
  return env("SUPABASE_STORAGE_BUCKET") ?? "library";
}

/** Guess a Content-Type from a file extension for a Storage upload. */
export function contentTypeFor(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "webp":
      return "image/webp";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

/** Public URL of an uploaded object, derived from the project URL + bucket. */
export function publicUrlFor(objectKey: string): string | undefined {
  const base = env("NEXT_PUBLIC_SUPABASE_URL");
  const bucket = storageBucket();
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${objectKey}`;
}

/** Build an S3 client from SUPABASE_S3_* env. Throws (listing the missing names,
 *  never the values) when any are absent — so a `--push` fails loudly up front. */
export function makeS3Client(): S3Client {
  const endpoint = env("SUPABASE_S3_ENDPOINT");
  const region = env("SUPABASE_S3_REGION");
  const accessKeyId = env("SUPABASE_S3_ACCESS_KEY_ID");
  const secretAccessKey = env("SUPABASE_S3_SECRET_ACCESS_KEY");
  const missing = [
    !endpoint && "SUPABASE_S3_ENDPOINT",
    !region && "SUPABASE_S3_REGION",
    !accessKeyId && "SUPABASE_S3_ACCESS_KEY_ID",
    !secretAccessKey && "SUPABASE_S3_SECRET_ACCESS_KEY",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `Storage push requires S3 env vars; missing: ${missing.join(", ")}`,
    );
  }
  return new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: accessKeyId as string,
      secretAccessKey: secretAccessKey as string,
    },
  });
}

/** Upload a single buffer to the bucket. Caller decides the object key. */
export async function putObject(
  client: S3Client,
  objectKey: string,
  body: Buffer | Uint8Array,
  localPathForType: string,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: storageBucket(),
      Key: objectKey,
      Body: body,
      ContentType: contentTypeFor(localPathForType),
    }),
  );
}
