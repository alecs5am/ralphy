export const CLAUDE_PROVIDER = "claude" as const;

export function claudeProvider(): { id: typeof CLAUDE_PROVIDER; available: boolean } {
  return { id: CLAUDE_PROVIDER, available: true };
}
