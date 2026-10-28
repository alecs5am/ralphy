// Markdown documents embedded as text (`import md from "./x.md" with { type: "text" }`).
// Bun inlines them at bundle time, so a compiled binary carries the content
// without a checkout (used by cli/lib/models/registry.ts, #574).
declare module "*.md" {
  const content: string;
  export default content;
}
