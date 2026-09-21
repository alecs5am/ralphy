/** Only declared catalog facets become tags; prose is never keyword-expanded. */
export function marketplaceTags(values: readonly unknown[]): string[] {
  const tags = new Set<string>();
  for (const value of values.slice(0, 128)) {
    if (typeof value !== "string" || value.length > 96 || /[<>\x00-\x1f]/.test(value)) continue;
    const tag = value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    if (tag) tags.add(tag);
    if (tags.size === 32) break;
  }
  return [...tags];
}
