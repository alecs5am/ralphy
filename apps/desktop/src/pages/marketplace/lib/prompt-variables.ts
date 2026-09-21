/** Only explicit bracketed slots are editable; arbitrary source text stays literal. */
export function promptVariables(source: string): string[] {
  return [...new Set([...source.matchAll(/\[([a-z][a-z\s-]{0,40})\]/gi)].map((match) => match[1]!))];
}

export function fillPrompt(source: string, values: Record<string, string>): string {
  return source.replace(/\[([a-z][a-z\s-]{0,40})\]/gi, (slot, name: string) => values[name]?.trim() || slot);
}
