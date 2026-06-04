"use client";

// BlueprintCta (#079) — the unit page's reproduce CTAs + the two modals they open.
//
// Replaces the old full-width inline BlueprintPanel dump. The unit page now reads
// as a Pinterest browse (viewer → similar units); the technical Blueprint lives
// behind a button:
//
//   • Blueprint — reproduce this unit  → blue button (.btn-blueprint) opening the
//     wide BlueprintModal, whose body is the full BlueprintBody (scenario /
//     prompts / composition / model stack / recipes / assets).
//   • Use in ralphy → always-visible button opening a small copy-command modal
//     (mirrors ComposeModal) with `ralphy blueprint use <unit-id> --project <id>`.
//
// Mirrors RemixModal / ComposeModal: Esc / backdrop close, ref-counted body
// scroll-lock (lockScroll / unlockScroll) while open. Pure presentation — the
// resolved Blueprint is handed down as a serializable prop from the server page.
// Renders nothing when the unit has no Blueprint.
//
// No visible borders: modal cards separate via bg-tint + shadow only.

import { useCallback, useEffect, useState } from "react";
import type { Blueprint } from "@/lib/library-v2/types";
import { CheckIcon, CloseIcon, CopyIcon, SparkIcon } from "../../_shared/icons";
import { lockScroll, unlockScroll } from "../../_shared/scrollLock";
import { BlueprintBody, blueprintCost } from "./BlueprintPanel";

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

/** Shared modal-shell hook: Esc + scroll-lock while mounted. */
function useModalShell(onClose: () => void) {
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
}

/** The full Blueprint detail in a wide scrollable modal. */
function BlueprintModal({
  title,
  blueprint,
  onClose,
}: {
  title: string;
  blueprint: Blueprint;
  onClose: () => void;
}) {
  useModalShell(onClose);
  const cost = blueprintCost(blueprint);

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card modal-card-wide bp-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="m-head">
          <div style={{ minWidth: 0 }}>
            <p className="m-eyebrow bp-eyebrow">Blueprint · reproduction recipe</p>
            <h3>{title}</h3>
            <p className="m-from">
              Everything Ralphy ran to make this unit — selectable and
              copy-pasteable.
              {cost ? ` · total cost to reproduce: ${cost}` : ""}
            </p>
          </div>
          <button type="button" className="m-close" onClick={onClose} aria-label="Close">
            <CloseIcon s={16} />
          </button>
        </div>

        <div className="bp-modal-body">
          <BlueprintBody blueprint={blueprint} />
        </div>
      </div>
    </div>
  );
}

/** The "Use in ralphy" copy-command modal (mirrors ComposeModal). */
function UseModal({
  title,
  unitId,
  onClose,
}: {
  title: string;
  unitId: string;
  onClose: () => void;
}) {
  useModalShell(onClose);
  const cli = `ralphy blueprint use ${unitId} --project <new-id>`;

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <div
            className="m-thumb"
            style={{
              background: "var(--bp-tint-2)",
              color: "var(--bp-ink)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <span style={{ fontFamily: "var(--font-display)", fontSize: 26 }}>▣</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="m-eyebrow bp-eyebrow">Use in ralphy</p>
            <h3>{title}</h3>
          </div>
          <button type="button" className="m-close" onClick={onClose} aria-label="Close">
            <CloseIcon s={16} />
          </button>
        </div>
        <p className="m-label">Run the CLI</p>
        <CopyRow value={cli} />
        <p className="m-hint">
          Reproduce this <strong>exact unit</strong> end-to-end — Ralphy replays the
          full Blueprint (scenario, prompts, model stack, composition) into a fresh
          project.
        </p>
      </div>
    </div>
  );
}

/** Left-column CTA island: the blue Blueprint button + the always-visible
 *  "Use in ralphy" button, plus the modals they open. Server page passes the
 *  resolved blueprint (serializable). Renders nothing without one. */
export function BlueprintCta({
  unitId,
  title,
  blueprint,
}: {
  unitId: string;
  title: string;
  blueprint?: Blueprint;
}) {
  const [view, setView] = useState<"none" | "blueprint" | "use">("none");
  const close = useCallback(() => setView("none"), []);

  if (!blueprint) return null;

  return (
    <>
      <div className="bp-cta-row">
        <button
          type="button"
          className="btn-blueprint"
          onClick={() => setView("blueprint")}
        >
          <span className="btn-blueprint-glyph" aria-hidden>
            ▣
          </span>
          Blueprint — reproduce this unit
        </button>
        <button type="button" className="btn-use-ralphy" onClick={() => setView("use")}>
          <SparkIcon s={15} /> Use in ralphy
        </button>
      </div>

      {view === "blueprint" && (
        <BlueprintModal title={title} blueprint={blueprint} onClose={close} />
      )}
      {view === "use" && <UseModal title={title} unitId={unitId} onClose={close} />}
    </>
  );
}
