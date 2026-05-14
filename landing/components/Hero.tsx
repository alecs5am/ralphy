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
  return (
    <span className="cycle" aria-live="polite">
      {prev && (
        <span key={`prev-${previous}`} className="cycle-row leaving" style={{ color: prev.color }}>
          <BrandLockup id={prev.id} />
        </span>
      )}
      <span key={`cur-${current}`} className="cycle-row entering" style={{ color: cur.color }}>
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
    <button className={`cmd ${copied ? "copied" : ""}`} onClick={copy} aria-label="Copy command">
      <span className="pr">$</span>
      <span className="cmd-text">{text}</span>
      <span className="copy">{copied ? <I.check /> : <I.copy />}</span>
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

function InstallStep({ idx, step }: { idx: number; step: Step }) {
  return (
    <div className="install-step">
      <div className="head">
        <span className="num">{idx + 1}</span>
        <span className="ttl">{step.title}</span>
      </div>
      <p className="desc">{step.desc}</p>
      {step.cmd && <CopyableCmd text={step.cmd} />}
      {step.link && (
        <a className="cmd" href={step.link.href} target="_blank" rel="noopener" style={{ textDecoration: "none" }}>
          <span>{step.link.label}</span>
          <span className="copy">
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
    <section id="top" className="hero">
      <div className="container-narrow">
        <h1>
          Turn
          <br />
          <CyclingAgent />
          <br />
          into a content factory
        </h1>

        <p className="hero-sub">
          The open-source CLI that plugs into any coding agent and turns it into a one-prompt video marketer.
          Trend-watch, clone any style, render in minutes, iterate from the numbers.
        </p>

        <div className="switcher-row">
          <div className="tab-row" role="tablist" aria-label="Method">
            {METHODS.map((m) => (
              <button
                key={m.id}
                className={`tab ${method === m.id ? "active" : ""}`}
                onClick={() => setMethod(m.id)}
                role="tab"
                aria-selected={method === m.id}
              >
                <span className="ic">{m.icon()}</span>
                {m.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="tab-row" role="tablist" aria-label="Agent">
              {AGENTS.map((a) => (
                <button
                  key={a.id}
                  className={`tab ${agent === a.id ? "active" : ""}`}
                  onClick={() => setAgent(a.id)}
                  role="tab"
                  aria-selected={agent === a.id}
                >
                  <span className="ic">{a.icon()}</span>
                  {a.name}
                </button>
              ))}
            </div>
            <a className="hero-github" href={site.repo} target="_blank" rel="noopener">
              <I.github /> Github <I.arrowR />
            </a>
          </div>
        </div>

        <div className="install-row">
          {steps.map((s, i) => (
            <InstallStep key={i} idx={i} step={s} />
          ))}
        </div>
      </div>
    </section>
  );
}
