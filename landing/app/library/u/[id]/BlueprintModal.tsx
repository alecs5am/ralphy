"use client";

// BlueprintCta (#079) — the unit page's reproduce CTAs + the two modals they open.
//
// Replaces the old full-width inline BlueprintPanel dump. The unit page now reads
// as a Pinterest browse (viewer → similar units); the technical Blueprint lives
// behind a button:
//
//   • Blueprint — reproduce this unit  → blue button (.btn-blueprint) opening the
//     wide TWO-PANE BlueprintModal (#080) — a LEFT rail of the present sections
//     (scenario / prompts / composition / model stack / recipes / hard assets,
//     via `blueprintSections()`) + a Use-in-ralphy CTA, beside a RIGHT pane that
//     scrolls only the selected section. Mirrors the skills detail modal; no
//     longer one giant scroll across every axis.
//   • Use in ralphy → always-visible button opening a small copy-command modal
//     (mirrors ComposeModal) with `ralphy blueprint use <unit-id> --project <id>`.
//     The same copy-command also lives INSIDE the Blueprint modal's left rail, so
//     the user can reproduce without closing it.
//
// Mirrors RemixModal / ComposeModal: Esc / backdrop close, ref-counted body
// scroll-lock (lockScroll / unlockScroll) while open. Both modals render through
// a PORTAL at `document.body` so the `.modal` overlay (z-index 220) escapes the
// unit page's stacking context and sits ABOVE the sticky Nav (z-index 50) — the
// navbar no longer overlaps the modal. Pure presentation — the resolved Blueprint
// is a serializable prop from the server page. Renders nothing without a Blueprint.
//
// No visible borders: modal cards separate via bg-tint + shadow only.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Blueprint } from "@/lib/library-v2/types";
import { CheckIcon, CloseIcon, CopyIcon, SparkIcon } from "../../_shared/icons";
import { lockScroll, unlockScroll } from "../../_shared/scrollLock";
import { blueprintCost, blueprintSections } from "./BlueprintPanel";

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

/** The full Blueprint detail in a wide two-pane modal (#080) — mirrors the
 *  skills detail `variant="modal"`: a fixed LEFT rail of the present sections
 *  (Scenario / Prompts / Composition / Model stack / Recipes / Hard assets) +
 *  the always-visible "Use in ralphy" CTA, beside a RIGHT pane that scrolls the
 *  selected section. Each section is addressable via `blueprintSections()` so the
 *  rail and pane stay in sync without one giant scroll across every axis.
 *
 *  Rendered through a portal at `document.body` so the overlay escapes the unit
 *  page's stacking context and the `.modal` z-index (220) reliably sits ABOVE
 *  the sticky Nav (z-index 50). */
function BlueprintModal({
  title,
  unitId,
  blueprint,
  onClose,
}: {
  title: string;
  unitId: string;
  blueprint: Blueprint;
  onClose: () => void;
}) {
  useModalShell(onClose);
  const cost = blueprintCost(blueprint);
  const sections = blueprintSections(blueprint);
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const cli = `ralphy blueprint use ${unitId} --project <new-id>`;

  const activeIndex = Math.max(
    0,
    sections.findIndex((s) => s.id === active),
  );

  if (typeof document === "undefined") return null;

  return createPortal(
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

        <div className="bp-two-pane">
          {/* LEFT — section rail + Use-in-ralphy CTA (fixed, does not scroll) */}
          <aside className="bp-rail" aria-label="Blueprint sections">
            <nav className="bp-rail-nav">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`bp-rail-item${s.id === active ? " is-active" : ""}`}
                  onClick={() => setActive(s.id)}
                >
                  {s.title}
                </button>
              ))}
            </nav>
            <div className="bp-rail-foot">
              <p className="m-label">Use in ralphy</p>
              <CopyRow value={cli} />
              <p className="bp-rail-hint">
                Replays the full Blueprint into a fresh project.
              </p>
            </div>
          </aside>

          {/* RIGHT — only the selected section scrolls */}
          <div className="bp-pane" key={active}>
            {sections[activeIndex]?.node}
          </div>
        </div>
      </div>
    </div>,
    document.body,
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

  if (typeof document === "undefined") return null;

  return createPortal(
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
    </div>,
    document.body,
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
        <BlueprintModal
          title={title}
          unitId={unitId}
          blueprint={blueprint}
          onClose={close}
        />
      )}
      {view === "use" && <UseModal title={title} unitId={unitId} onClose={close} />}
    </>
  );
}
