// landing/scripts/lib/storage.ts
//
// Shared media-storage helpers for the publish scripts (issue #056). Storage was
// migrated off Supabase Storage onto Bunny CDN (June 2026) to stop the Supabase
// egress overage — Postgres stays on Supabase, media bytes live in a Bunny
// Storage Zone served by the `ralphy.b-cdn.net` pull zone.
//
//   Bunny storage path:  <BUNNY_STORAGE_ZONE>/<objectKey>   (PUT, lazy dirs)
//   Public CDN URL:      <BUNNY_CDN_BASE>/<objectKey>
//
// Secrets are read from the environment at RUNTIME only — never printed, never
// hardcoded. Run publish scripts with `bun --env-file=.env.local …`.

/** Read an env var, returning undefined for unset / empty. Never logs the value. */
export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

/** The Bunny Storage Zone name (default `ralphy`). */
export function storageBucket(): string {
  return env("BUNNY_STORAGE_ZONE") ?? "ralphy";
}

/** Guess a Content-Type from a file extension for an upload. */
export function contentTypeFor(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "webp":
      return "image/webp";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "html":
      return "text/html";
    case "json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

/** Public CDN URL of an uploaded object, derived from the Bunny pull-zone base. */
export function publicUrlFor(objectKey: string): string | undefined {
  const base = env("BUNNY_CDN_BASE");
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/${objectKey.replace(/^\//, "")}`;
}

/** A Bunny Storage uploader handle (host + zone + write password). */
export interface BunnyUploader {
  host: string;
  zone: string;
  password: string;
}

/** Build a Bunny uploader from BUNNY_STORAGE_* env. Throws (listing the missing
 *  names, never the values) when any are absent — so a `--push` fails loudly. */
export function makeUploader(): BunnyUploader {
  const host = env("BUNNY_STORAGE_HOST");
  const zone = env("BUNNY_STORAGE_ZONE");
  const password = env("BUNNY_STORAGE_PASSWORD");
  const missing = [
    !host && "BUNNY_STORAGE_HOST",
    !zone && "BUNNY_STORAGE_ZONE",
    !password && "BUNNY_STORAGE_PASSWORD",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Storage push requires Bunny env vars; missing: ${missing.join(", ")}`);
  }
  return { host: host as string, zone: zone as string, password: password as string };
}

/** Upload a single buffer to the Bunny Storage Zone. Caller decides the object key. */
export async function putObject(
  uploader: BunnyUploader,
  objectKey: string,
  body: Buffer | Uint8Array,
  localPathForType: string,
): Promise<void> {
  const key = objectKey.replace(/^\//, "");
  const url = `https://${uploader.host}/${uploader.zone}/${key}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      AccessKey: uploader.password,
      "Content-Type": contentTypeFor(localPathForType),
    },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Bunny PUT ${key} → HTTP ${res.status} ${detail}`);
  }
}
