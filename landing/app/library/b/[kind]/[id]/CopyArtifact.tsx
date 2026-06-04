"use client";

// Library v2 — Screen 3 (Recipe branch, #084): a copyable artifact code block.
// Client island: a mono <pre> showing the recipe's reusable artifact (an ffmpeg
// filtergraph / a HyperFrames snippet / a prompt template) with a copy-to-
// clipboard button. The copy idiom matches ComposeModal's CopyRow (clipboard
// API with a document.execCommand fallback + a 1.6s "Copied" pulse).
//
// No visible borders: the block separates via bg-tint + shadow + spacing.

import { useCallback, useState } from "react";
import { CheckIcon, CopyIcon } from "../../../_shared/icons";

export function CopyArtifact({ artifact, label }: { artifact: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(artifact);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = artifact;
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
  }, [artifact]);

  return (
    <div className="rx-artifact">
      <div className="rx-artifact-bar">
        {label && <span className="rx-artifact-label">{label}</span>}
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
      <pre className="bp-pre rx-pre">{artifact}</pre>
    </div>
  );
}
