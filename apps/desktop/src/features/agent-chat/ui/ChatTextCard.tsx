import { useEffect, useId, useState } from "react";
import { bridge } from "@/shared/api/ipc";
import { Check, Copy, FileText, WandSparkles } from "@/shared/ui/icons";

/** Copyable creative material; the text stays inert, including markup and command examples. */
export function ChatTextCard({ kind, title, text }: { kind: "prompt" | "caption"; title?: string; text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const id = useId();
  const label = title || (kind === "prompt" ? "Prompt" : "Caption");
  const Icon = kind === "prompt" ? WandSparkles : FileText;
  const long = text.length > 240 || text.split("\n").length > 3;
  useEffect(() => { setCopyState("idle"); setExpanded(false); }, [text]);
  const copy = async () => {
    try { await bridge.copyText(text); setCopyState("copied"); }
    catch { setCopyState("failed"); }
  };
  return <section className="agent-text-card min-w-0 rounded-field bg-chat-field p-2.5 text-ink" aria-label={label}>
    <div className="flex min-w-0 items-center gap-2">
      <Icon size={14} className="shrink-0 text-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate type-sm font-medium" title={label}>{label}</span>
      <button type="button" className="inline-flex h-6 shrink-0 items-center gap-1 rounded-chip px-1.5 type-xs text-muted hover:bg-chat-control-hover hover:text-ink" aria-label={`Copy ${kind}`} onClick={() => void copy()}>
        {copyState === "copied" ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
        <span role="status">{copyState === "copied" ? "Copied" : copyState === "failed" ? "Retry copy" : "Copy"}</span>
      </button>
    </div>
    <p id={id} className={`m-0 mt-1.5 whitespace-pre-wrap break-words type-sm leading-row ${long && !expanded ? "line-clamp-3" : ""}`}>{text}</p>
    {long && <button type="button" className="mt-1 rounded-chip py-0.5 type-xs text-muted hover:text-ink" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>{expanded ? "Show less" : "Show full text"}</button>}
  </section>;
}
