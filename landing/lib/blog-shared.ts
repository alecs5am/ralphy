/* Client-safe slice of lib/blog.ts. The main module imports `node:fs`
 * / `node:path` and is server-only — anything a client component
 * needs (types, formatDate) lives here so webpack doesn't drag the
 * node modules into the client bundle. */

export type Frontmatter = {
  title?: string;
  description?: string;
  date?: string;
  author?: string;
  github?: string;
  authors?: string[];
  category?: string;
  visibility?: "public" | "draft" | "hidden";
  tags?: string[];
};

export type PostSummary = {
  slug: string;
  frontmatter: Frontmatter;
};

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
