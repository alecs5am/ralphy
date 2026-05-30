import { useEffect, useRef, useState } from "react";
import type { ChatItem } from "../screens/Workspace";

export function Chat({ items, busy, onSend }: { items: ChatItem[]; busy: boolean; onSend: (p: string) => void }) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="chat">
      <div className="messages" ref={scrollRef}>
        {items.length === 0 && (
          <div className="msg assistant">
            <span className="who">Ralphy</span>
            <div className="bubble">
              Tell me what to make — "an unboxing for my coffee grinder", "a 15s UGC ad
              for my skincare set". I'll match a format / template, draft the scenario, and
              check with you before any paid generation.
            </div>
          </div>
        )}
        {items.map((it, i) => <Item key={i} item={it} />)}
        {busy && <div className="tool running"><span className="glyph">●</span> working…</div>}
      </div>

      <div className="composer">
        <div className="field">
          <textarea
            rows={1}
            placeholder="Describe the video, or give the next instruction…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          />
          <button className="btn btn-vio" onClick={submit} disabled={busy || !draft.trim()}>Send</button>
        </div>
        <span className="hint">Enter to send · Shift+Enter for newline</span>
      </div>
    </div>
  );
}

function Item({ item }: { item: ChatItem }) {
  if (item.kind === "tool" && item.tool) {
    const { name, summary, estCostUsd, running } = item.tool;
    return (
      <div className={`tool${running ? " running" : ""}`}>
        <span className="glyph">{running ? "●" : "✓"}</span>
        <span>{name}</span>
        <span style={{ color: "var(--mute)" }}>{summary}</span>
        {estCostUsd != null && <span className="cost">· ~${estCostUsd.toFixed(2)}</span>}
      </div>
    );
  }
  return (
    <div className={`msg ${item.kind}`}>
      <span className="who">{item.kind === "user" ? "You" : "Ralphy"}</span>
      <div className="bubble">{item.text}</div>
    </div>
  );
}
