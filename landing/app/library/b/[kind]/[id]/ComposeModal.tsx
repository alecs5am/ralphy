"use client";

// Library v2 — Screen 3: the "Use this {kind}" Compose modal + its trigger.
// Ported from the prototype's block.jsx ComposeModal, reusing the shared modal /
// copy-row styling (library.css `.modal` / `.m-copyrow`). Copy-only: it surfaces
// the agent tag `@{kind}:{id}` and the CLI command `ralphy compose --{kind} {id}`.
// Esc / backdrop close; body scroll-locked (ref-counted) while open.
//
// No visible borders: the modal card separates via bg-tint + shadow only.

import { useCallback, useEffect, useState } from "react";
import type { Block, BlockKind } from "@/lib/library-v2/types";
import { blockGlyph, blockKindLabel } from "../../../_shared/blockMeta";
import { CheckIcon, CloseIcon, CopyIcon, SparkIcon } from "../../../_shared/icons";
import { lockScroll, unlockScroll } from "../../../_shared/scrollLock";

function CopyRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* swallow */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [value]);
  return (
    <div className="m-copyrow">
      <code>{value}</code>
      <button type="button" className={`copy${copied ? " copied" : ""}`} onClick={copy}>
        {copied ? (
          <>
            <CheckIcon /> Copied
          </>
        ) : (
          <>
            <CopyIcon /> Copy
          </>
        )}
      </button>
    </div>
  );
}

function ComposeModal({
  kind,
  block,
  kindLabel,
  onClose,
}: {
  kind: BlockKind;
  block: Block;
  kindLabel: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [onClose]);

  const tag = `@${kind}:${block.id}`;
  const cli = `ralphy compose --${kind} ${block.id}`;
  const lower = kindLabel.toLowerCase();

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <div
            className="m-thumb"
            style={{ background: "var(--block-tint-2)", color: "var(--block-ink)", display: "grid", placeItems: "center" }}
          >
            <span style={{ fontFamily: "var(--font-display)", fontSize: 26 }}>{blockGlyph(block)}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="m-eyebrow">Compose from this {lower}</p>
            <h3>{block.name}</h3>
          </div>
          <button type="button" className="m-close" onClick={onClose} aria-label="Close">
            <CloseIcon s={16} />
          </button>
        </div>
        <p className="m-label">1 · Paste the tag into your agent</p>
        <CopyRow value={tag} />
        <p className="m-label">2 · Or run the CLI</p>
        <CopyRow value={cli} />
        <p className="m-hint">
          Ralphy starts a <strong>new composition</strong> with this {lower} locked in — you fill the
          other slots with your brief and refs.
        </p>
      </div>
    </div>
  );
}

/** The header CTA button + the modal it opens. Client island so the server page
 *  stays static; everything it needs is passed as plain props. */
export function ComposeCta({
  kind,
  block,
  kindLabel,
}: {
  kind: BlockKind;
  block: Block;
  kindLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-remix" onClick={() => setOpen(true)}>
        <SparkIcon s={15} /> Use this {kindLabel.toLowerCase()}
      </button>
      {open && (
        <ComposeModal kind={kind} block={block} kindLabel={kindLabel} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/** Standalone trigger (used by the empty-state "compose one" link) — opens the
 *  same modal but renders as a text button. */
export function ComposeLink({
  kind,
  block,
  kindLabel,
  children,
}: {
  kind: BlockKind;
  block: Block;
  kindLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: "none",
          border: 0,
          padding: 0,
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: "inherit",
          color: "var(--vio)",
          textDecoration: "underline",
        }}
      >
        {children}
      </button>
      {open && (
        <ComposeModal kind={kind} block={block} kindLabel={kindLabel} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
