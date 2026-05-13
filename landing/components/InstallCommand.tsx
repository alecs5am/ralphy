"use client";

import { useState } from "react";
import { Block, Inline, Mono } from "./Block";
import { site } from "@/lib/site";

export function InstallCommand() {
  const [copied, setCopied] = useState<"idle" | "copied" | "error">("idle");

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(site.install);
      setCopied("copied");
      setTimeout(() => setCopied("idle"), 1600);
    } catch {
      setCopied("error");
      setTimeout(() => setCopied("idle"), 1600);
    }
  };

  return (
    <section id="install" className="relative">
      <div className="mx-auto max-w-[1180px] px-7">
        <Block
          n="04"
          title={<>Install. Drop in 2 keys. Ship your first ad in this session.</>}
          lede={
            <>
              One curl, one wizard, two API keys — <Mono>openrouter</Mono> and{" "}
              <Mono>elevenlabs</Mono>. The first render starts in the same
              terminal you opened five minutes ago. Works on{" "}
              <Inline>macOS</Inline> · <Inline>Linux</Inline> ·{" "}
              <Inline>Windows</Inline>.
            </>
          }
        >
          <div className="hud overflow-hidden rounded-xl border border-[rgb(120_198_255/0.18)] bg-[rgb(4_7_12/0.85)] backdrop-blur">
            <span className="corner-tl" />
            <span className="corner-br" />

            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] bg-[rgb(6_9_15/0.85)] px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex gap-1.5" aria-hidden>
                  <span className="h-[9px] w-[9px] rounded-full bg-[#ff8a65]" />
                  <span className="h-[9px] w-[9px] rounded-full bg-[#ffd166]" />
                  <span
                    className="h-[9px] w-[9px] rounded-full bg-[var(--color-cyan)]"
                    style={{ boxShadow: "0 0 8px var(--color-cyan)" }}
                  />
                </span>
                <span
                  className="text-[13px] text-[var(--color-mute)]"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  ~/ralphy — install.sh
                </span>
              </div>

              <button
                onClick={onCopy}
                aria-label="Copy install command"
                className="rounded-md border border-[var(--color-line-2)] bg-transparent px-2.5 py-1 text-[12px] text-[var(--color-frost-2)] transition hover:border-[var(--color-cyan)] hover:text-[var(--color-cyan)] data-[state=copied]:border-[var(--color-cyan)] data-[state=copied]:bg-[var(--color-cyan)] data-[state=copied]:text-[var(--color-ink)]"
                data-state={copied}
                style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.04em" }}
              >
                {copied === "copied" ? "Copied ✓" : copied === "error" ? "Press ⌘C" : "Copy"}
              </button>
            </div>

            <pre
              className="overflow-x-auto px-6 py-6 text-[14.5px] leading-[1.7] text-[var(--color-frost)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <span style={{ color: "var(--color-mute-2)" }}>{`# 1 · install the ralphy binary (~60 MB, includes runtime)\n`}</span>
              <span style={{ color: "var(--color-cyan)" }}>$ </span>
              <span>{site.install}</span>
              {`\n`}
              <span style={{ color: "var(--color-mute)" }}>{`⠂ detecting platform        `}</span>
              <span style={{ color: "var(--color-cyan-2)" }}>→ darwin-arm64</span>
              {`\n`}
              <span style={{ color: "var(--color-mute)" }}>{`⠂ downloading ralphy v0.2.0 `}</span>
              <span style={{ color: "var(--color-cyan-2)" }}>→ ~/.local/bin/ralphy</span>
              {`\n`}
              <span style={{ color: "var(--color-mute)" }}>{`⠂ verifying signature       `}</span>
              <span style={{ color: "var(--color-cyan-2)" }}>→ ok</span>
              {`\n\n`}
              <span style={{ color: "var(--color-mute-2)" }}>{`# 2 · meet your slime\n`}</span>
              <span style={{ color: "var(--color-cyan)" }}>$ </span>
              ralphy setup
              {`\n`}
              <span style={{ color: "var(--color-mute)" }}>{`┌  ralphy setup · interactive\n`}</span>
              <span style={{ color: "var(--color-mute)" }}>{`│  api keys      `}</span>
              <span style={{ color: "var(--color-cyan-2)" }}>✓ openrouter  ✓ elevenlabs</span>
              {`\n`}
              <span style={{ color: "var(--color-mute)" }}>{`│  profiles      `}</span>
              <span style={{ color: "var(--color-cyan-2)" }}>✓ ralphy-showcase imported</span>
              {`\n`}
              <span style={{ color: "var(--color-mute)" }}>{`│  doctor        `}</span>
              <span style={{ color: "var(--color-cyan-2)" }}>blockers: []</span>
              {`\n`}
              <span style={{ color: "var(--color-mute)" }}>{`└  ready · run \`claude\` in this folder\n\n`}</span>
              <span style={{ color: "var(--color-mute-2)" }}>{`# 3 · ship\n`}</span>
              <span style={{ color: "var(--color-cyan)" }}>claude&gt; </span>
              make me 3 hyper-motion TikTok ads for my SaaS launch
              {`\n`}
              <span style={{ color: "var(--color-mute)" }}>{`  ralph-researcher → ralph-scenarist → ralph-renderer → ralph-critic\n  ⠼ rendering variant 02/03 · iter #12 · ai-score +12%\n  `}</span>
              <span style={{ color: "var(--color-cyan-2)" }}>✓ workspace/projects/launch-001/render/v01.mp4</span>
            </pre>
          </div>
        </Block>
      </div>
    </section>
  );
}
