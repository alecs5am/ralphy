/* Shared blog helpers — used by app/blog/[slug]/page.tsx and the OG
 * image route (app/blog/[slug]/opengraph-image.tsx). Keeps frontmatter
 * parsing, author resolution, and date formatting in one place.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export type Author = {
  /** Display name. Falls back to the handle if no name supplied. */
  name: string;
  /** GitHub handle for the avatar + profile link. Validated against
   *  GitHub's actual pattern; invalid handles are stripped. */
  handle?: string;
  /** Optional role string, e.g. "Founder, Ralphy". Used by the OG card. */
  role?: string;
};

export type Frontmatter = {
  title?: string;
  description?: string;
  date?: string;
  /** Single author (back-compat). Prefer `authors` for new posts. */
  author?: string;
  /** GitHub handle for single-author posts (back-compat). */
  github?: string;
  /** Multi-author byline. Each entry is one of:
   *    "alecs5am"
   *    "Display Name|alecs5am"
   *    "Display Name|alecs5am|Founder, Ralphy"
   */
  authors?: string[];
  /** Category chip shown in the byline + OG card top-right. */
  category?: string;
};

export type Post = {
  slug: string;
  source: string;
  frontmatter: Frontmatter;
};

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");
const GH_HANDLE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

export function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

export function isValidHandle(h: string | undefined): h is string {
  return typeof h === "string" && GH_HANDLE.test(h);
}

export async function readPost(slug: string): Promise<Post | null> {
  if (!isSafeSlug(slug)) return null;
  const file = path.join(CONTENT_DIR, `${slug}.mdx`);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
  const { source, frontmatter } = parseFrontmatter(raw);
  return { slug, source, frontmatter };
}

/* Minimal frontmatter parser — supports flat `key: "value"` pairs and
 * `key: [..., ...]` JSON-array values. */
export function parseFrontmatter(raw: string): {
  source: string;
  frontmatter: Frontmatter;
} {
  if (!raw.startsWith("---\n")) return { source: raw, frontmatter: {} };
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return { source: raw, frontmatter: {} };
  const block = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\n/, "");
  const fm = {} as Record<string, unknown>;
  for (const line of block.split("\n")) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.+)$/);
    if (!m) continue;
    const key = m[1]!;
    let value: string = m[2]!.trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      try {
        fm[key] = JSON.parse(value);
        continue;
      } catch {
        /* fall through */
      }
    }
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    fm[key] = value;
  }
  return { source: body, frontmatter: fm as Frontmatter };
}

/* Normalize the various frontmatter shapes into a clean list of authors.
 * Each entry supports:
 *    "alecs5am"                              → handle only
 *    "Alex Samoilov|alecs5am"                → display + handle
 *    "Alex Samoilov|alecs5am|Founder, Ralphy" → display + handle + role
 *
 * Invalid handles are stripped (the entry stays but loses avatar/link).
 */
export function resolveAuthors(fm: Frontmatter): Author[] {
  let raw: Array<{ name?: string; handle?: string; role?: string }> = [];
  if (Array.isArray(fm.authors) && fm.authors.length > 0) {
    raw = fm.authors.map((entry) => {
      const parts = entry.split("|").map((s) => s.trim());
      if (parts.length >= 3) {
        return { name: parts[0], handle: parts[1], role: parts[2] };
      }
      if (parts.length === 2) {
        return { name: parts[0], handle: parts[1] };
      }
      return { name: parts[0], handle: parts[0] };
    });
  } else if (fm.github || fm.author) {
    raw = [{ name: fm.author ?? fm.github, handle: fm.github }];
  }
  return raw
    .map((a) => ({
      name: a.name,
      handle: isValidHandle(a.handle) ? a.handle : undefined,
      role: a.role,
    }))
    .filter((a) => a.name || a.handle)
    .map((a) => ({
      name: a.name ?? a.handle!,
      handle: a.handle,
      role: a.role,
    }));
}

export function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
