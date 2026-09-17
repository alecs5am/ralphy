import { mkdtemp, rm, statfs } from "node:fs/promises";
import { join } from "node:path";
import type { DesktopSystemInfo } from "../shared/desktop-system";

/** Probe the active library without overwriting any user-owned file. */
export async function probeLibrary(path: string | null): Promise<Pick<DesktopSystemInfo, "libraryWritable" | "libraryError" | "availableBytes">> {
  if (!path) return { libraryWritable: false, libraryError: "Open a library to check its storage.", availableBytes: null };
  let temporary: string | undefined;
  try {
    const disk = await statfs(path);
    temporary = await mkdtemp(join(path, ".desktop-write-check-"));
    await rm(temporary, { recursive: true });
    temporary = undefined;
    return { libraryWritable: true, libraryError: null, availableBytes: disk.bavail * disk.bsize };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
    return { libraryWritable: false, libraryError: `Library storage check failed (${code}). Check disk space and folder permissions.`, availableBytes: null };
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
  }
}
