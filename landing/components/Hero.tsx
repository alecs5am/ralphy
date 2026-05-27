"use client";

import { useEffect, useState, type ReactNode } from "react";
import { site } from "@/lib/data";
import { I } from "./Icons";
import { BrandLockup } from "./BrandLockup";

const AGENTS = [
  { id: "claude", name: "Claude", short: "Claude Code", color: "#D97757", icon: () => <I.claude /> },
  { id: "cursor", name: "Cursor", short: "Cursor", color: "#F5F5F4", icon: () => <I.cursor /> },
  { id: "codex", name: "Codex", short: "Codex", color: "#FFFFFF", icon: () => <I.codex /> },
];

const CYCLE_BRANDS = [
  { id: "claude", color: "#D97757" },
  { id: "cursor", color: "#F5F5F4" },
  { id: "codex", color: "#FFFFFF" },
  { id: "gemini", color: "#3186FF" },
  { id: "openclaw", color: "#FF4D4D" },
];

const METHODS = [
  { id: "cli", name: "CLI", icon: () => <I.cli /> },
  { id: "mcp", name: "MCP", icon: () => <I.mcp /> },
  { id: "skill", name: "Skill", icon: () => <I.skill /> },
];

function CyclingAgent() {
  const [current, setCurrent] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    let leaveTimer: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      if (!alive) return;
      setCurrent((c) => {
        setPrevious(c);
        return (c + 1) % CYCLE_BRANDS.length;
      });
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        if (alive) setPrevious(null);
      }, 1100);
    }, 4400);
    return () => {
      alive = false;
      clearInterval(id);
      if (leaveTimer) clearTimeout(leaveTimer);
    };
  }, []);

  const cur = CYCLE_BRANDS[current];
  const prev = previous == null ? null : CYCLE_BRANDS[previous];
  const rowCls =
    "absolute inset-0 inline-flex items-center justify-center gap-[0.18em] whitespace-nowrap text-ink";
  return (
    <span
      className="inline-flex items-center justify-center align-[-0.04em] relative overflow-hidden h-[1.15em] w-[8em] shrink-0"
      aria-live="polite"
    >
      {prev && (
        <span
          key={`prev-${previous}`}
          className={`${rowCls} motion-reduce:animate-none animate-[cycleOut_1000ms_cubic-bezier(0.65,0.05,0.36,1)_both]`}
          style={{ color: prev.color }}
        >
          <BrandLockup id={prev.id} />
        </span>
      )}
      <span
        key={`cur-${current}`}
        className={`${rowCls} motion-reduce:animate-none animate-[cycleIn_1000ms_cubic-bezier(0.65,0.05,0.36,1)_both]`}
        style={{ color: cur.color }}
      >
        <BrandLockup id={cur.id} />
      </span>
    </span>
  );
}

export function CopyableCmd({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <button
      className="mt-auto flex items-center gap-2 py-[13px] px-4 bg-[#050506] rounded-[11px] font-mono text-[13.5px] text-ink cursor-pointer min-w-0 [overflow-wrap:anywhere] break-words text-left transition-colors hover:bg-[#0A0A0B]"
      onClick={copy}
      aria-label="Copy command"
    >
      <span className="text-vio">$</span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere] break-words leading-[1.45]">{text}</span>
      <span className={`ml-auto inline-flex items-center ${copied ? "text-vio" : "text-mute"}`}>{copied ? <I.check /> : <I.copy />}</span>
    </button>
  );
}

type Step = {
  title: string;
  desc: ReactNode;
  cmd?: string | null;
  link?: { label: string; href: string };
};

function buildSteps(method: string, agentId: string): Step[] {
  const ag = AGENTS.find((a) => a.id === agentId) || AGENTS[0];

  if (method === "cli") {
    return [
      {
        title: "Install the CLI",
        desc: (
          <>
            One curl — fetches the prebuilt binary for your platform. Works on{" "}
            <span className="inl">macOS</span> · <span className="inl">Linux</span> ·{" "}
            <span className="inl">Windows</span>.
          </>
        ),
        cmd: site.install,
      },
      {
        title: "Drop in your keys",
        desc: (
          <>
            Interactive wizard, takes ~30s. Paste your <span className="inl">openrouter</span> +{" "}
            <span className="inl">elevenlabs</span> keys when prompted.
          </>
        ),
        cmd: "ralphy setup",
      },
      {
        title: `Run from ${ag.short}`,
        desc: (
          <>
            Open a project, ask <span className="inl">{ag.short}</span> to make a video. The agent picks up{" "}
            <span className="inl">ralphy</span> from your <span className="inl">$PATH</span> — no plugin needed.
          </>
        ),
        cmd: "ralphy doctor",
      },
    ];
  }

  if (method === "mcp") {
    // Per-agent MCP register command. Uses each agent's *real* native
    // registration tool: Claude Code's `claude mcp add`, the Cursor MCP
    // config file, and the OpenAI Codex CLI `codex mcp add`. The binary
    // exposed is `ralphy mcp` (a future subcommand documented in the CLI
    // UX vision doc — server doesn't ship yet).
    const mcpRegister: Record<string, string> = {
      claude: "claude mcp add ralphy -- ralphy mcp",
      cursor: "code ~/.cursor/mcp.json   # add { mcpServers: { ralphy: { command: 'ralphy', args: ['mcp'] } } }",
      codex: "codex mcp add ralphy -- ralphy mcp",
    };
    return [
      {
        title: "Install the CLI",
        desc: (
          <>
            One curl — installs the <span className="inl">ralphy</span> binary that doubles as an MCP server.
          </>
        ),
        cmd: site.install,
      },
      {
        title: `Register with ${ag.short}`,
        desc: (
          <>
            Wire Ralphy in via <span className="inl">{ag.short}</span>&apos;s native MCP registry — no custom URL,
            no auth, the server runs locally.
          </>
        ),
        cmd: mcpRegister[ag.id] || mcpRegister.claude,
      },
      {
        title: `Restart ${ag.short} and chat`,
        desc: (
          <>
            New tools show up under <span className="inl">@ralphy</span> in the tool list. Then just say:{" "}
            <span className="inl">&ldquo;Make 5 TikToks for my launch.&rdquo;</span>
          </>
        ),
        cmd: null,
      },
    ];
  }

  // Skill flow — drop the repo's markdown skill bundle into the agent's
  // skills directory. Uses git clone, which works for every agent that
  // reads `~/.<agent>/skills/<name>/`.
  const skillsTarget: Record<string, string> = {
    claude: "~/.claude/skills/ralphy",
    cursor: "~/.cursor/rules/ralphy",
    codex: "~/.codex/skills/ralphy",
  };
  return [
    {
      title: "Install the CLI",
      desc: (
        <>
          One curl — Ralphy ships its skill bundle alongside the binary.
        </>
      ),
      cmd: site.install,
    },
    {
      title: `Link skills into ${ag.short}`,
      desc: (
        <>
          Symlinks the markdown skill files into <span className="inl">{skillsTarget[ag.id] || skillsTarget.claude}</span>.
          Each skill is one file — hot-reloads on save.
        </>
      ),
      cmd: `ralphy skill install --agent ${ag.id}`,
    },
    {
      title: "Open a project and ask",
      desc: (
        <>
          From any chat:{" "}
          <span className="inl">&ldquo;Generate a TikTok with Ralphy.&rdquo;</span> The skill orchestrates the full
          pipeline — research, prompts, render, eval.
        </>
      ),
      cmd: null,
    },
  ];
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      className={`inline-flex items-center gap-2 px-[14px] py-2 rounded-[10px] font-sans text-[14px] font-medium tracking-[-0.005em] border-0 cursor-pointer transition-colors ${
        active
          ? "bg-[rgb(255_255_255/0.96)] text-[#0A0A0B] shadow-[0_1px_1px_rgb(0_0_0/0.35),0_0_0_1px_rgb(255_255_255/0.18)_inset] [&_.ic]:text-[#0A0A0B]"
          : "bg-transparent text-ink-3 hover:text-ink-2"
      }`}
      onClick={onClick}
      role="tab"
      aria-selected={active}
    >
      <span className="ic inline-flex items-center w-4 h-4 text-ink-3 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:block">{icon}</span>
      {label}
    </button>
  );
}

function InstallStep({ idx, step }: { idx: number; step: Step }) {
  return (
    <div className="bg-bg-1 rounded-[18px] pt-[26px] px-6 pb-5 flex flex-col gap-[14px]">
      <div className="flex items-center gap-3">
        <span className="w-7 h-7 grid place-items-center rounded-full bg-bg-3 text-ink font-mono text-[12.5px] font-bold">{idx + 1}</span>
        <span className="font-semibold text-[16px] text-ink tracking-[-0.005em]">{step.title}</span>
      </div>
      <p className="text-ink-3 text-[14px] leading-[1.55] [&_.inl]:font-mono [&_.inl]:bg-[color-mix(in_srgb,var(--color-vio)_12%,transparent)] [&_.inl]:px-1.5 [&_.inl]:py-px [&_.inl]:rounded-[5px] [&_.inl]:text-vio-2 [&_.inl]:text-[12.5px]">
        {step.desc}
      </p>
      {step.cmd && <CopyableCmd text={step.cmd} />}
      {step.link && (
        <a
          className="mt-auto flex items-center gap-2 py-[13px] px-4 bg-[#050506] rounded-[11px] font-mono text-[13.5px] text-ink cursor-pointer min-w-0 [overflow-wrap:anywhere] break-words text-left transition-colors no-underline hover:bg-[#0A0A0B]"
          href={step.link.href}
          target="_blank"
          rel="noopener"
        >
          <span>{step.link.label}</span>
          <span className="ml-auto text-mute inline-flex items-center">
            <I.arrowR />
          </span>
        </a>
      )}
    </div>
  );
}

export function Hero() {
  const [method, setMethod] = useState("cli");
  const [agent, setAgent] = useState("claude");
  const steps = buildSteps(method, agent);

  return (
    <section id="top" className="pt-20 pb-6 text-center min-[900px]:pt-[120px] min-[900px]:pb-14">
      <div className="container-narrow">
        <h1 className="font-display font-bold text-[clamp(40px,6.4vw,80px)] leading-[1.04] tracking-[-0.02em] uppercase text-ink mx-auto max-w-[20ch] text-balance [&_.acc]:text-vio">
          Turn
          <br />
          <CyclingAgent />
          <br />
          into a content factory
        </h1>

        <p className="mt-[22px] mx-auto max-w-[560px] text-[clamp(15.5px,1.2vw,17.5px)] text-ink-3 leading-[1.55] text-balance">
          The open-source CLI that plugs into any coding agent and turns it into a one-prompt video marketer.
          Trend-watch, clone any style, render in minutes, iterate from the numbers.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-[14px] max-[720px]:justify-center max-[720px]:gap-[10px] [&>.flex]:flex-wrap max-[720px]:[&>.flex]:w-full max-[720px]:[&>.flex]:justify-center max-[720px]:[&>.flex]:gap-2">
          <div className="inline-flex items-center gap-0.5 bg-bg-2 rounded-xl p-[3px]" role="tablist" aria-label="Method">
            {METHODS.map((m) => (
              <TabButton key={m.id} active={method === m.id} onClick={() => setMethod(m.id)} icon={m.icon()} label={m.name} />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-0.5 bg-bg-2 rounded-xl p-[3px]" role="tablist" aria-label="Agent">
              {AGENTS.map((a) => (
                <TabButton key={a.id} active={agent === a.id} onClick={() => setAgent(a.id)} icon={a.icon()} label={a.name} />
              ))}
            </div>
            <a
              className="inline-flex items-center gap-1.5 font-mono text-[13px] text-ink-3 px-[14px] py-2 rounded-[9px] transition-colors hover:text-ink hover:bg-[rgb(255_255_255/0.04)]"
              href={site.repo}
              target="_blank"
              rel="noopener"
            >
              <I.github /> Github <I.arrowR />
            </a>
          </div>
        </div>

        <div className="mt-7 grid gap-[10px] grid-cols-[minmax(0,1fr)] min-[900px]:grid-cols-[repeat(3,minmax(0,1fr))] text-left">
          {steps.map((s, i) => (
            <InstallStep key={i} idx={i} step={s} />
          ))}
        </div>
      </div>
    </section>
  );
}
