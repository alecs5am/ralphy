import type { Block } from "./types.js";

/** Normalize source-declared tags and typed facets, without mining prose. */
export function blockTags(block: Block): string[] {
  const values = [...(Array.isArray(block.tags) ? block.tags : []), block.format, block.sub, block.recipeKind];
  const tags = new Set<string>();
  for (const value of values.slice(0, 128)) {
    if (typeof value !== "string" || value.length > 96 || /[<>\x00-\x1f]/.test(value)) continue;
    const tag = value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    if (tag) tags.add(tag);
    if (tags.size === 32) break;
  }
  return [...tags];
}

export interface LibraryBlockFilter { query?: string; tag?: string }

export function filterLibraryBlocks(blocks: Block[], filter: LibraryBlockFilter = {}): Block[] {
  const tag = filter.tag?.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const tokens = filter.query?.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean) ?? [];
  return blocks.map((block) => ({ ...block, tags: blockTags(block) })).filter((block) => {
    if (tag && !block.tags.includes(tag)) return false;
    const text = [block.id, block.name, block.blurb, ...block.tags].join(" ").toLocaleLowerCase();
    return tokens.every((token) => text.includes(token));
  });
}
