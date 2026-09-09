import { Fragment, createElement, useEffect, useState, type ReactNode } from "react";
import { parseDocument } from "htmlparser2";
import { marked, type Token, type Tokens } from "marked";

/* A rendered document carries no classes of its own -- marked emits bare `h2`, `pre`, `td` -- so
   descendant variants on the root are the only expression available. Two rules govern them:
   a utility inside `[&_h2]:` is (0,1,1) and beats every per-element utility beneath it, so no
   element under this root states its own type or surface; and where two variants could name one
   property, the more specific selector is chosen deliberately (`[&_li>p]:my-*` over `[&_p]:my-*`,
   `[&_pre_code]:bg-transparent` over `[&_code]:bg-*`, `[&_.markdown-alert]:` over `[&_blockquote]:`).
   Tone is a prop rather than a caller override because this component renders as a document in
   the documents route and the marketplace, and as one turn of a transcript in the agent chat:
   surface and ink have to travel as a pair, and a caller repainting half of one is the documented
   defect. Both tones are the theme family now -- handoff 17 moved the chat onto a white card, so
   the on-dark skin that existed for the black rail has nothing left to paint. */
type MarkdownTone = "document" | "chat";

/* The other two document views 15-markdown-view.css covered: a plain-text body and the fallback
   the JSON view drops to when the text will not parse. Both are the same mono block, so the
   string lives beside the markdown one rather than being restated at each `<pre>`. The reading
   canvas is not part of it -- that is the mounting surface's decision, see DOCUMENT_CANVAS in
   screens/project/DocumentsPanel.tsx. */
export const PLAIN_TEXT_VIEW = "font-code type-sm leading-document whitespace-pre-wrap text-muted";

interface MarkdownViewProps {
  markdown: string;
  baseUrl?: string;
  tone?: MarkdownTone;
  allowUrl?(url: URL, kind: "link" | "image", raw: string): boolean;
}

/* Rhythm, shape and behaviour: the same on either surface. No border, no shadow and no hairline
   anywhere -- the code block, the table, the disclosure, the keycap and the thematic break all
   separated themselves with a 1px `--line` before, and design v2 separates by surface or by air.
   The blockquote keeps a 2px inset mark, which is the one exception the contract allows. */
const DOCUMENT_RHYTHM = [
  "[&_:is(h1,h2,h3,h4,h5,h6)]:leading-document-heading",
  "[&_h1]:mt-0 [&_h1]:mb-(--document-heading-space-close)",
  "[&_:is(h2,h3,h4,h5,h6)]:mt-(--document-heading-space) [&_:is(h2,h3,h4,h5,h6)]:mb-(--document-heading-space-close)",
  "[&_p]:my-(--document-paragraph-space) [&_li>p]:my-(--document-list-paragraph-space)",
  /* Tailwind's preflight sets `list-style: none` on every list, so a rendered markdown list has
     been drawing without its markers. A task item is the one that keeps none: its checkbox is
     the marker, and it is pulled into the marker column by the negative margin below. */
  "[&_:is(ul,ol)]:pl-6 [&_ul]:list-disc [&_ol]:list-decimal [&_li:has(>input[type=checkbox])]:list-none",
  "[&_code]:rounded-chip [&_code]:font-code [&_code]:type-sm",
  "[&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5",
  "[&_pre]:overflow-auto [&_pre]:rounded-field [&_pre]:px-3.5 [&_pre]:py-3 [&_pre_code]:bg-transparent",
  "[&_blockquote]:my-(--document-block-space) [&_blockquote]:pl-3.5",
  "[&_.markdown-alert]:rounded-field [&_.markdown-alert]:py-2.25 [&_.markdown-alert]:pr-3",
  "[&_.markdown-alert-label]:block [&_.markdown-alert-label]:type-xs [&_.markdown-alert-label]:font-normal",
  "[&_a]:underline [&_a]:underline-offset-2",
  "[&_.markdown-table-scroll]:my-3.5 [&_.markdown-table-scroll]:overflow-x-auto [&_.markdown-table-scroll]:rounded-field",
  "[&_table]:w-max [&_table]:min-w-full [&_table]:border-collapse",
  "[&_:is(th,td)]:min-w-18 [&_:is(th,td)]:px-2.5 [&_:is(th,td)]:py-2 [&_:is(th,td)]:text-left [&_:is(th,td)]:align-top",
  "[&_:is(th,td):first-child]:min-w-40 [&_:is(th,td):first-child]:whitespace-normal",
  "[&_details]:my-3 [&_details]:rounded-field [&_details]:px-2.75 [&_details]:py-2.25 [&_summary]:cursor-pointer",
  "[&_img]:inline-block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-field [&_img]:align-middle",
  /* A thematic break is air, not a line: `hr` is the one element whose UA border survives
     Tailwind's preflight, so it has to be cancelled explicitly. */
  "[&_hr]:my-5 [&_hr]:border-0",
  "[&_kbd]:rounded-key [&_kbd]:px-1.25 [&_kbd]:py-px [&_kbd]:font-code [&_kbd]:type-xs",
  "[&_mark]:rounded-key",
  /* The renderer wraps a list item's copy in a `p`, so a task item drew its checkbox alone on
     the line above its label. Only the item's leading paragraph goes inline; a second one still
     breaks. This was wrong before the migration too. */
  "[&_input[type=checkbox]]:mr-1.75 [&_input[type=checkbox]]:-ml-5 [&_li>input[type=checkbox]+p]:inline",
  "[&_.markdown-align-center]:text-center [&_.markdown-align-right]:text-right",
].join(" ");

/* On a light widget: the documents route's reading pane and the marketplace's detail cards. */
const DOCUMENT_TONE = [
  "text-ink leading-document",
  "[&_h1]:type-xl [&_h2]:type-heading [&_h3]:type-lg",
  "[&_code]:bg-document-plate [&_code]:text-muted",
  "[&_pre]:bg-document-plate [&_th]:bg-document-plate [&_th]:text-ink",
  "[&_details]:bg-document-plate [&_kbd]:bg-document-plate",
  "[&_blockquote]:text-muted [&_blockquote]:[box-shadow:var(--document-quote-mark)]",
  "[&_.markdown-alert]:bg-document-plate [&_.markdown-alert-label]:text-ink",
  "[&_:is(.markdown-alert-warning,.markdown-alert-caution)_.markdown-alert-label]:text-muted",
  "[&_summary]:text-muted [&_.markdown-image-link]:text-muted [&_.markdown-link]:text-muted",
  "[&_a]:text-ink [&_a]:decoration-ink/45",
  "[&_mark]:bg-muted/28 [&_mark]:text-ink",
  "[&_input[type=checkbox]]:accent-ink",
].join(" ");

/* One turn of a transcript. The same ink and the same plates as a document -- the chat card is a
   card -- and one thing a document does not do: a turn owns its outer air, so its first and last
   block give theirs up. The selector names the root's own class so it reads (0,3,0) and outranks
   the `[&_h1]:mt-0` and `[&_p]:my-*` variants at (0,1,1) rather than racing them in the sheet. */
const CHAT_TONE = [
  DOCUMENT_TONE,
  "[&.markdown-view>:first-child]:mt-0 [&.markdown-view>:last-child]:mb-0",
].join(" ");

interface HtmlNode {
  type: string;
  data?: string;
  name?: string;
  attribs?: Record<string, string>;
  children?: HtmlNode[];
}

const SAFE_HTML_TAGS = new Set([
  "a", "abbr", "b", "blockquote", "br", "caption", "code", "col", "colgroup", "del", "details", "div", "em",
  "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "kbd", "li", "mark", "ol",
  "p", "pre", "s", "small", "span", "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th",
  "thead", "tr", "u", "ul",
]);
const VOID_HTML_TAGS = new Set(["br", "col", "hr", "img"]);
const ALERT_LABELS: Record<string, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

function withoutFrontmatter(markdown: string): string {
  return markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

function safeUrl(value: string | undefined, baseUrl: string | undefined, kind: "link" | "image", allowUrl?: MarkdownViewProps["allowUrl"]): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    return (url.protocol === "https:" || url.protocol === "http:") && (!allowUrl || allowUrl(url, kind, value)) ? url.toString() : null;
  } catch {
    return null;
  }
}

function positiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100 ? parsed : undefined;
}

function MarkdownImage({ src, alt, title }: { src: string; alt: string; title?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [src]);
  return failedUrl === src
    ? <span className="markdown-image-fallback">[image unavailable: {alt || "provider image"}]</span>
    : <img src={src} alt={alt} title={title} loading="lazy" decoding="async" onError={() => setFailedUrl(src)} />;
}

function html(nodes: HtmlNode[], keyPrefix: string, baseUrl?: string, allowUrl?: MarkdownViewProps["allowUrl"]): ReactNode {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "text") return <Fragment key={key}>{node.data}</Fragment>;
    const tag = node.name?.toLowerCase();
    if (!tag || tag === "script" || tag === "style") return null;
    const children = html(node.children ?? [], key, baseUrl, allowUrl);
    if (!SAFE_HTML_TAGS.has(tag)) return <Fragment key={key}>{children}</Fragment>;

    const attributes = node.attribs ?? {};
    const props: Record<string, unknown> = { key };
    if (tag === "a") {
      const href = safeUrl(attributes.href, baseUrl, "link", allowUrl);
      if (!href) return <span className="markdown-link" key={key}>{children}</span>;
      Object.assign(props, { href, target: "_blank", rel: "noreferrer", title: attributes.title });
    }
    if (tag === "img") {
      const src = safeUrl(attributes.src, baseUrl, "image", allowUrl);
      if (!src) return attributes.alt ? <span className="markdown-image-link" key={key}>[image: {attributes.alt}]</span> : null;
      return <MarkdownImage src={src} alt={attributes.alt ?? ""} title={attributes.title} key={key} />;
    }
    if (tag === "td" || tag === "th") Object.assign(props, { colSpan: positiveInteger(attributes.colspan), rowSpan: positiveInteger(attributes.rowspan) });
    if (tag === "ol") props.start = positiveInteger(attributes.start);
    if (tag === "details" && "open" in attributes) props.open = true;
    if (tag === "abbr" && attributes.title) props.title = attributes.title;
    if (tag === "code" && /^language-[\w-]+$/.test(attributes.class ?? "")) props.className = attributes.class;
    if (["left", "center", "right"].includes(attributes.align)) props.className = `markdown-align-${attributes.align}`;

    const element = createElement(tag, props, VOID_HTML_TAGS.has(tag) ? undefined : children);
    return tag === "table" ? <div className="markdown-table-scroll" key={key}>{element}</div> : element;
  });
}

function htmlFragment(value: string, key: string, baseUrl?: string, allowUrl?: MarkdownViewProps["allowUrl"]): ReactNode {
  return html((parseDocument(value, { decodeEntities: true }) as unknown as { children: HtmlNode[] }).children, key, baseUrl, allowUrl);
}

function inline(tokens: Token[] | undefined, keyPrefix: string, baseUrl?: string, allowUrl?: MarkdownViewProps["allowUrl"]): ReactNode {
  const output: ReactNode[] = [];
  for (let index = 0; index < (tokens?.length ?? 0); index += 1) {
    const token = tokens![index];
    const key = `${keyPrefix}-${index}`;
    if (token.type === "html") {
      const opening = token.raw.match(/^<([a-z][\w-]*)\b[^>]*>$/i)?.[1].toLowerCase();
      if (opening && !VOID_HTML_TAGS.has(opening)) {
        let depth = 1;
        let end = index + 1;
        for (; end < tokens!.length; end += 1) {
          const raw = tokens![end].raw;
          if (new RegExp(`^<${opening}\\b[^>]*>$`, "i").test(raw)) depth += 1;
          if (new RegExp(`^</${opening}\\s*>$`, "i").test(raw)) depth -= 1;
          if (depth === 0) break;
        }
        if (depth === 0) {
          output.push(<Fragment key={key}>{htmlFragment(tokens!.slice(index, end + 1).map((item) => item.raw).join(""), key, baseUrl, allowUrl)}</Fragment>);
          index = end;
          continue;
        }
      }
      output.push(<Fragment key={key}>{htmlFragment(token.raw, key, baseUrl, allowUrl)}</Fragment>);
      continue;
    }
    if (token.type === "strong") output.push(<strong key={key}>{inline(token.tokens, key, baseUrl, allowUrl)}</strong>);
    else if (token.type === "em") output.push(<em key={key}>{inline(token.tokens, key, baseUrl, allowUrl)}</em>);
    else if (token.type === "del") output.push(<del key={key}>{inline(token.tokens, key, baseUrl, allowUrl)}</del>);
    else if (token.type === "codespan") output.push(<code key={key}>{token.text}</code>);
    else if (token.type === "br") output.push(<br key={key} />);
    else if (token.type === "link") {
      const href = safeUrl(token.href, baseUrl, "link", allowUrl);
      output.push(href
        ? <a href={href} target="_blank" rel="noreferrer" title={token.title ?? undefined} key={key}>{inline(token.tokens, key, baseUrl, allowUrl)}</a>
        : <span className="markdown-link" key={key}>{inline(token.tokens, key, baseUrl, allowUrl)}</span>);
    }
    else if (token.type === "image") {
      const src = safeUrl(token.href, baseUrl, "image", allowUrl);
      output.push(src
        ? <MarkdownImage src={src} alt={token.text} title={token.title ?? undefined} key={key} />
        : <span className="markdown-image-link" key={key}>[image: {token.text}]</span>);
    }
    else if ("tokens" in token && Array.isArray(token.tokens)) output.push(<Fragment key={key}>{inline(token.tokens, key, baseUrl, allowUrl)}</Fragment>);
    else output.push(<Fragment key={key}>{"text" in token ? token.text : token.raw}</Fragment>);
  }
  return output;
}

function blocks(tokens: Token[], keyPrefix = "md", baseUrl?: string, allowUrl?: MarkdownViewProps["allowUrl"]): ReactNode {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.type === "space") return null;
    if (token.type === "heading") return createElement(`h${token.depth}`, { key }, inline(token.tokens, key, baseUrl, allowUrl));
    if (token.type === "paragraph") return <p key={key}>{inline(token.tokens, key, baseUrl, allowUrl)}</p>;
    if (token.type === "text") return token.tokens ? <p key={key}>{inline(token.tokens, key, baseUrl, allowUrl)}</p> : <Fragment key={key}>{token.text}</Fragment>;
    if (token.type === "code") return <pre key={key}><code className={token.lang ? `language-${token.lang}` : undefined}>{token.text}</code></pre>;
    if (token.type === "blockquote") {
      const alert = token.text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?/i)?.[1].toLowerCase();
      return alert
        ? <blockquote className={`markdown-alert markdown-alert-${alert}`} key={key}><strong className="markdown-alert-label">{ALERT_LABELS[alert]}</strong>{blocks(marked.lexer(token.text.replace(/^\[![^\]]+\]\s*\n?/i, "")), key, baseUrl, allowUrl)}</blockquote>
        : <blockquote key={key}>{blocks(token.tokens ?? [], key, baseUrl, allowUrl)}</blockquote>;
    }
    if (token.type === "hr") return <hr key={key} />;
    if (token.type === "list") {
      const list = token as Tokens.List;
      const Tag = list.ordered ? "ol" : "ul";
      return <Tag start={list.ordered ? list.start || undefined : undefined} key={key}>{list.items.map((item, itemIndex) => (
        <li key={`${key}-${itemIndex}`}>{item.task && <input type="checkbox" checked={item.checked} readOnly />}{blocks(item.tokens, `${key}-${itemIndex}`, baseUrl, allowUrl)}</li>
      ))}</Tag>;
    }
    if (token.type === "table") {
      const table = token as Tokens.Table;
      return <div className="markdown-table-scroll" key={key}><table><thead><tr>{table.header.map((cell, cellIndex) => <th key={cellIndex}>{inline(cell.tokens, `${key}-h-${cellIndex}`, baseUrl, allowUrl)}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{inline(cell.tokens, `${key}-${rowIndex}-${cellIndex}`, baseUrl, allowUrl)}</td>)}</tr>)}</tbody></table></div>;
    }
    if (token.type === "html") return htmlFragment(token.text, key, baseUrl, allowUrl);
    return <p key={key}>{token.raw}</p>;
  });
}

export function MarkdownView({ markdown, baseUrl, tone = "document", allowUrl }: MarkdownViewProps) {
  return <article className={`markdown-view ${DOCUMENT_RHYTHM} ${tone === "chat" ? CHAT_TONE : DOCUMENT_TONE}`}>{blocks(marked.lexer(withoutFrontmatter(markdown)), "md", baseUrl, allowUrl)}</article>;
}
