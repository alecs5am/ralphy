"use client";

import { useState, type ReactNode } from "react";

interface FileMeta {
  path: string;
  content: string;
}

interface TreeNode {
  name: string;
  full?: string;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: "", children: [] };
  for (const p of paths) {
    const parts = p.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isLeaf = i === parts.length - 1;
      let next = node.children.find((c) => c.name === part);
      if (!next) {
        next = { name: part, children: [] };
        node.children.push(next);
      }
      if (isLeaf) next.full = p;
      node = next;
    });
  }
  return root;
}

function FileIcon() {
  return (
    <svg className="w-4 h-4 shrink-0 opacity-75" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12.34 2.75H5.75a1 1 0 0 0-1 1v16.5a1 1 0 0 0 1 1h12.5a1 1 0 0 0 1-1V9.66a1 1 0 0 0-.29-.7L13.04 3.04a1 1 0 0 0-.7-.29Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.75 13.25h3.5M8.75 17.25h6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12.75 3.25v5a1 1 0 0 0 1 1h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="w-4 h-4 shrink-0 opacity-75" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2.75 6.75c0-.55.45-1 1-1h5.4c.33 0 .64.16.83.44L11.5 8h7.75c.55 0 1 .45 1 1v8.25c0 .55-.45 1-1 1H3.75c-.55 0-1-.45-1-1V6.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

const labelCls = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono";

function TreeBranch({
  node,
  active,
  onPick,
  depth = 0,
}: {
  node: TreeNode;
  active: string;
  onPick: (full: string) => void;
  depth?: number;
}) {
  return (
    <ul className="list-none m-0 p-0">
      {node.children.map((child) =>
        child.full ? (
          <li key={child.full}>
            <button
              className={`flex items-center gap-[0.45rem] w-full text-left py-[0.32rem] px-2 rounded-lg text-[0.8rem] leading-tight transition-colors ${
                active === child.full ? "bg-vio text-bg [&_svg]:opacity-100" : "text-ink-2 hover:bg-bg-1 hover:text-ink"
              }`}
              style={{ paddingLeft: `${0.5 + depth * 0.9}rem` }}
              onClick={() => onPick(child.full!)}
            >
              <FileIcon />
              <span className={labelCls}>{child.name}</span>
            </button>
          </li>
        ) : (
          <li key={child.name}>
            <span
              className="flex items-center gap-[0.45rem] w-full py-[0.32rem] px-2 text-[0.8rem] leading-tight text-ink-3"
              style={{ paddingLeft: `${0.5 + depth * 0.9}rem` }}
            >
              <FolderIcon />
              <span className={labelCls}>{child.name}</span>
            </span>
            <TreeBranch node={child} active={active} onPick={onPick} depth={depth + 1} />
          </li>
        ),
      )}
    </ul>
  );
}

export function SkillFiles({
  files,
  children,
  githubUrl,
  variant = "page",
}: {
  files: FileMeta[];
  children: ReactNode[];
  githubUrl?: string;
  variant?: "page" | "modal";
}) {
  const [active, setActive] = useState(files[0]?.path ?? "");
  const [copied, setCopied] = useState(false);
  const activeIndex = Math.max(0, files.findIndex((f) => f.path === active));
  const multi = files.length > 1;
  const tree = buildTree(files.map((f) => f.path));

  async function copy() {
    const file = files[activeIndex];
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  const explorerSize = variant === "modal" ? "flex-1 min-h-0" : "h-[min(560px,68vh)]";

  return (
    <div className={`flex flex-col min-h-0 min-w-0 ${variant === "modal" ? "flex-1" : ""}`}>
      <div className={`flex min-h-0 min-w-0 gap-2 p-2 bg-bg-2 rounded-[14px] ${explorerSize}`}>
        {multi && (
          <aside className="skill-scroll shrink-0 w-[218px] min-h-0 overflow-y-auto py-[0.3rem] px-[0.2rem]" aria-label="Skill files">
            <p className="text-[0.66rem] uppercase tracking-[0.08em] text-ink-3 px-2 pt-[0.15rem] pb-[0.45rem] m-0">
              Files · {files.length}
            </p>
            <TreeBranch node={tree} active={active} onPick={setActive} />
          </aside>
        )}

        <div className="skill-doc flex-1 min-w-0 min-h-0 flex flex-col bg-bg-1 rounded-[10px] overflow-hidden">
          <div className="flex-none flex items-center px-[0.9rem] py-2 text-ink-3">
            <code className="text-[0.76rem] text-ink-3 font-mono">{multi ? active : files[0]?.path ?? "SKILL.md"}</code>
          </div>
          <div className="skill-scroll flex-1 min-h-0 overflow-y-auto px-[1.15rem] pt-[0.1rem] pb-[1.15rem]">
            <div className="blog-body lib-body">{children[activeIndex]}</div>
          </div>
        </div>
      </div>

      <div className="flex-none flex items-center justify-between gap-2 pt-[0.85rem]">
        <button
          className="border-0 bg-bg-2 text-ink-2 text-[0.74rem] px-[0.7rem] py-[0.28rem] rounded-full cursor-pointer transition-colors hover:bg-ink hover:text-bg"
          onClick={copy}
        >
          {copied ? "Copied" : "Copy md"}
        </button>
        {githubUrl && (
          <a
            className="inline-flex items-center gap-[0.15rem] bg-ink text-bg rounded-full px-[0.95rem] py-[0.42rem] text-[0.8rem] font-semibold no-underline transition-[background,transform] hover:bg-ink-2 hover:-translate-y-px"
            href={githubUrl}
            target="_blank"
            rel="noopener"
          >
            View on GitHub
            <span aria-hidden> →</span>
          </a>
        )}
      </div>
    </div>
  );
}
