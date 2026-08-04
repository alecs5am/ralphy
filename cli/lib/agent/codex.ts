export const CODEX_PROVIDER = "codex" as const;

export function codexProvider(): { id: typeof CODEX_PROVIDER; available: boolean } {
  return { id: CODEX_PROVIDER, available: true };
}
