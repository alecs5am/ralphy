// Bun 1.3 double-closes Playwright's extra stdio descriptors during GC.
// Fixed upstream: https://github.com/oven-sh/bun/pull/33828
export const MIN_BUN_VERSION = "1.4.2";

export function supportedBunVersion(version: string | undefined): boolean {
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) return false;
  const [major, minor, patch] = version.split(".").map(Number) as [number, number, number];
  return major > 1 || (major === 1 && (minor > 4 || (minor === 4 && patch >= 2)));
}

export function assertSupportedBun(version = process.versions.bun): void {
  if (!supportedBunVersion(version)) {
    throw new Error(`Bun ${MIN_BUN_VERSION} or newer is required (found ${version ?? "none"}). Older runtimes can close unrelated files during browser cleanup. Use the pinned project runtime with mise exec bun@${MIN_BUN_VERSION}, or a current compiled Ralphy binary.`);
  }
}
