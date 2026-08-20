import { Fragment, createElement, useEffect, useState, type ReactNode } from "react";
import { parseDocument } from "htmlparser2";
import { marked, type Token, type Tokens } from "marked";

interface MarkdownViewProps {
  markdown: string;
  baseUrl?: string;
  allowUrl?(url: URL, kind: "link" | "image", raw: string): boolean;
}

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

export function MarkdownView({ markdown, baseUrl, allowUrl }: MarkdownViewProps) {
  return <article className="markdown-view">{blocks(marked.lexer(withoutFrontmatter(markdown)), "md", baseUrl, allowUrl)}</article>;
}
