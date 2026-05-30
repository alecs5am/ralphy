"use client";

// Detail-page hero meta column + floating Remix button (design_handoff_detail_rework).
// Client island: the server page owns layout + cover + breadcrumb + results gallery;
// this owns the on-demand details disclosure (models + copy rows + how-it-works) and
// the sticky floating Remix button that appears once the hero scrolls out of view.
//
// Remix is a one-click COPY of the @template:<slug> tag straight to the clipboard
// (paste it into your coding agent). No modal — the full details (tag, CLI, models,
// how-it-works) already live on the page under the "Details…" disclosure.

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevDown, CheckIcon, CopyIcon, RemixIcon } from "../_shared/icons";

async function writeClipboard(value: string) {
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
}

function CopyRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    await writeClipboard(value);
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

export function DetailMeta({
  name,
  tagline,
  formatLabel,
  hue,
  count,
  models,
  tag,
  cli,
}: {
  name: string;
  tagline?: string;
  formatLabel: string;
  hue: string;
  count: number;
  models: string[];
  tag: string;
  cli: string;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [copied, setCopied] = useState(false);
  const metaRef = useRef<HTMLDivElement | null>(null);

  // Floating Remix appears once the hero scrolls out of view — observe the
  // enclosing `.detail-top` section.
  useEffect(() => {
    const hero = metaRef.current?.closest(".detail-top");
    if (!hero) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { threshold: 0 });
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  const copyTag = useCallback(async () => {
    await writeClipboard(tag);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [tag]);

  return (
    <div className="detail-meta" ref={metaRef}>
      <span className="card-flabel" style={{ color: hue }}>
        <span className="dot" style={{ background: hue }} />
        {formatLabel}
        {count > 0 && <span style={{ color: "var(--mute)" }}> · {count} outputs</span>}
      </span>
      <h1 className="detail-title">{name}</h1>
      {tagline && <p className="detail-sub">{tagline}</p>}

      <div className="cta-row">
        <button type="button" className="btn-remix btn-remix-lg" onClick={copyTag}>
          {copied ? (
            <>
              <CheckIcon /> Copied — paste in your agent
            </>
          ) : (
            <>
              <RemixIcon s={17} /> Remix this template
            </>
          )}
        </button>
        <p className="cta-micro">
          Copies <code style={{ fontFamily: "var(--font-mono)" }}>{tag}</code> · paste it into your coding agent · bring your own brief
        </p>
      </div>

      <button
        type="button"
        className={`details-toggle${showDetails ? " open" : ""}`}
        onClick={() => setShowDetails((v) => !v)}
        aria-expanded={showDetails}
      >
        <ChevDown s={15} /> {showDetails ? "Hide" : "Details, models & how it works"}
      </button>

      {showDetails && (
        <div className="details-panel">
          {models.length > 0 && (
            <>
              <p className="dp-label">Models used</p>
              <ul className="detail-models">
                {models.map((m) => (
                  <li key={m} className="modelchip">{m}</li>
                ))}
              </ul>
            </>
          )}
          <p className="dp-label">Paste this into your agent</p>
          <CopyRow value={tag} />
          <p className="dp-label">Or run the CLI</p>
          <CopyRow value={cli} />
          <p className="dp-steps">
            The agent reads the full recipe — prompts, refs and composition — via AGENTS.md routing,
            then re-runs only what your swap touches. <strong>You bring the brief.</strong>
          </p>
        </div>
      )}

      <button
        type="button"
        className={`floating-remix${stuck ? " show" : ""}`}
        onClick={copyTag}
        aria-hidden={!stuck}
      >
        {copied ? (
          <>
            <CheckIcon /> Copied
          </>
        ) : (
          <>
            <RemixIcon s={16} /> Remix
          </>
        )}
      </button>
    </div>
  );
}
