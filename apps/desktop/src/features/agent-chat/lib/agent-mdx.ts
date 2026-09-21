import { parseDocument } from "htmlparser2";
import { marked } from "marked";
import type { ProjectReference } from "@/shared/api/ipc";

export type UnitCardReference = ProjectReference & { unitId: string; title?: string };
export type AgentMessagePart =
  | { kind: "markdown"; text: string }
  | { kind: "unit"; reference: UnitCardReference }
  | { kind: "prompt" | "caption"; title?: string; text: string };
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const UNIT_ATTRIBUTES = new Set(["workspaceId", "projectId", "unitId", "title"]);
const COPY_ATTRIBUTES = new Set(["title", "text"]);
const CARD_START = /^<(?:UnitCard|PromptCard|CaptionCard)(?:\s|\/>)/;
const CARD = /^<(UnitCard|PromptCard|CaptionCard)((?:\s+[A-Za-z][A-Za-z0-9]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/>$/;

function parseCard(raw: string): Exclude<AgentMessagePart, { kind: "markdown" }> | null {
  const match = CARD.exec(raw);
  if (!match) return null;
  const node = parseDocument(raw, { xmlMode: true, decodeEntities: true }).children[0];
  if (node?.type !== "tag" || node.children.length) return null;
  const keys = Object.keys(node.attribs);
  const attributes = [...match[2].matchAll(/\s+([A-Za-z][A-Za-z0-9]*)\s*=\s*(?:"[^"]*"|'[^']*')/g)];
  if (attributes.length !== keys.length) return null;
  const { title } = node.attribs;
  if ((title?.length ?? 0) > 200) return null;
  if (node.name === "UnitCard") {
    const { workspaceId, projectId, unitId } = node.attribs;
    return ID.test(workspaceId ?? "") && ID.test(projectId ?? "") && ID.test(unitId ?? "")
      && keys.every((key) => UNIT_ATTRIBUTES.has(key))
      ? { kind: "unit", reference: { workspaceId, projectId, unitId, ...(title ? { title } : {}) } } : null;
  }
  const { text } = node.attribs;
  return text?.trim() && text.length <= 8000 && keys.every((key) => COPY_ATTRIBUTES.has(key))
    ? { kind: node.name === "PromptCard" ? "prompt" : "caption", text, ...(title ? { title } : {}) } : null;
}

/** MDX here is declarative data. No expressions, imports, handlers, or arbitrary components run. */
export function parseAgentMessage(markdown: string): AgentMessagePart[] {
  const parts: AgentMessagePart[] = [];
  const tokens = marked.lexer(markdown);
  for (const token of tokens) {
    // Inline tokens retain source order and protect code spans. Block tokens protect fences.
    // An HTML block can also contain prose: requiring the whole block to be cards hid them.
    let inline = token.type === "paragraph" || (token.type === "html" && CARD_START.test(token.raw.trimStart()))
      ? marked.Lexer.lexInline(token.raw) : [token];
    // Do not promote examples nested inside ordinary HTML containers into interactive cards.
    if (inline.some((item) => item.type === "html" && /^<\/?[A-Za-z]/.test(item.raw) && !CARD_START.test(item.raw))) inline = [token];
    for (const item of inline) {
      const card = item.type === "html" && !("inRawBlock" in item && item.inRawBlock) ? parseCard(item.raw) : null;
      if (card) { parts.push(card); continue; }
      const previous = parts.at(-1);
      if (previous?.kind === "markdown") previous.text += item.raw;
      else if (item.raw.trim()) parts.push({ kind: "markdown", text: item.raw });
    }
  }
  // Markdown fragments are rendered independently; references keep their document-wide scope.
  const definitions: string[] = [];
  marked.walkTokens(tokens, (token) => { if (token.type === "def") definitions.push(token.raw); });
  for (const part of parts) {
    if (part.kind !== "markdown") continue;
    const missing = definitions.filter((definition) => !part.text.includes(definition));
    if (missing.length) part.text += `\n\n${missing.join("\n")}`;
  }
  return parts;
}
