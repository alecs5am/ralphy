// Non-TypeScript source files embedded as text (`import src from "./x.py" with { type: "text" }`).
// Bun inlines them at bundle time, so a compiled binary carries the content
// without a checkout (used by cli/lib/track/engine.ts, #559).
declare module "*.py" {
  const content: string;
  export default content;
}
