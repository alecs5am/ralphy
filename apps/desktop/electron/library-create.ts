import { randomUUID } from "node:crypto";
import type { CanvasCli } from "./canvas/runtime-cli";

export function libraryName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120 || /[\x00-\x1f]/.test(value)) {
    throw Object.assign(new Error("Enter a name between 1 and 120 characters."), { code: "E_VALIDATION_FAILED" });
  }
  return value.trim();
}
export async function createLibraryEntry(cli: CanvasCli, kind: "workspace" | "project", name: unknown): Promise<string> {
  const title = libraryName(name);
  // Unique slugs also support names in scripts which do not transliterate to ASCII.
  const stem = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || kind;
  const slug = `${stem}-${randomUUID().slice(0, 8)}`;
  const result = await cli([kind, "create", "--as", slug, "--name", title, ...(kind === "workspace" ? [slug] : [])]) as { id?: unknown };
  if (typeof result?.id !== "string") throw new Error("The runtime did not return the new item.");
  return result.id;
}
