import { Fragment, type ReactNode } from "react";
import { marked, type Token, type Tokens } from "marked";

interface MarkdownViewProps {
  markdown: string;
}

function inline(tokens: Token[] | undefined, keyPrefix: string): ReactNode {
  return tokens?.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.type === "strong") return <strong key={key}>{inline(token.tokens, key)}</strong>;
    if (token.type === "em") return <em key={key}>{inline(token.tokens, key)}</em>;
    if (token.type === "del") return <del key={key}>{inline(token.tokens, key)}</del>;
    if (token.type === "codespan") return <code key={key}>{token.text}</code>;
    if (token.type === "br") return <br key={key} />;
    if (token.type === "link") {
      return <span className="markdown-link" title={token.href} key={key}>{inline(token.tokens, key)}</span>;
    }
    if (token.type === "image") return <span className="markdown-image-link" key={key}>[image: {token.text}]</span>;
    if ("tokens" in token && Array.isArray(token.tokens)) return <Fragment key={key}>{inline(token.tokens, key)}</Fragment>;
    return <Fragment key={key}>{"text" in token ? token.text : token.raw}</Fragment>;
  });
}

function blocks(tokens: Token[], keyPrefix = "md"): ReactNode {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.type === "space") return null;
    if (token.type === "heading") {
      const content = inline(token.tokens, key);
      if (token.depth === 1) return <h1 key={key}>{content}</h1>;
      if (token.depth === 2) return <h2 key={key}>{content}</h2>;
      if (token.depth === 3) return <h3 key={key}>{content}</h3>;
      if (token.depth === 4) return <h4 key={key}>{content}</h4>;
      if (token.depth === 5) return <h5 key={key}>{content}</h5>;
      return <h6 key={key}>{content}</h6>;
    }
    if (token.type === "paragraph") return <p key={key}>{inline(token.tokens, key)}</p>;
    if (token.type === "text") {
      return token.tokens
        ? <p key={key}>{inline(token.tokens, key)}</p>
        : <Fragment key={key}>{token.text}</Fragment>;
    }
    if (token.type === "code") {
      return <pre key={key}><code className={token.lang ? `language-${token.lang}` : undefined}>{token.text}</code></pre>;
    }
    if (token.type === "blockquote") return <blockquote key={key}>{blocks(token.tokens ?? [], key)}</blockquote>;
    if (token.type === "hr") return <hr key={key} />;
    if (token.type === "list") {
      const list = token as Tokens.List;
      const Tag = list.ordered ? "ol" : "ul";
      return (
        <Tag start={list.ordered ? list.start || undefined : undefined} key={key}>
          {list.items.map((item: Tokens.ListItem, itemIndex: number) => (
            <li key={`${key}-${itemIndex}`}>
              {item.task && <input type="checkbox" checked={item.checked} readOnly />}
              {blocks(item.tokens, `${key}-${itemIndex}`)}
            </li>
          ))}
        </Tag>
      );
    }
    if (token.type === "table") {
      const table = token as Tokens.Table;
      return (
        <div className="markdown-table-scroll" key={key}>
          <table>
            <thead><tr>{table.header.map((cell, cellIndex) => <th key={cellIndex}>{inline(cell.tokens, `${key}-h-${cellIndex}`)}</th>)}</tr></thead>
            <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{inline(cell.tokens, `${key}-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    if (token.type === "html") return <pre className="markdown-html" key={key}>{token.text}</pre>;
    return <p key={key}>{token.raw}</p>;
  });
}

export function MarkdownView({ markdown }: MarkdownViewProps) {
  return <article className="markdown-view">{blocks(marked.lexer(markdown))}</article>;
}
