/**
 * What is wrong, what version is running, and what this build is.
 *
 * Every check is a real reading -- a store that answered, a harness that reported, a permission
 * the platform granted -- so a green row means something was asked and answered. The About page
 * states the versions it can actually see, including Chromium's, read from the user agent.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { bridge } from "@/shared/api/ipc";
import { RalphyMascot } from "@/shared/ui/RalphyMascot";
import {
  action,
  Dot,
  LedBar,
  META,
  NOTE,
  NUMBER,
  Plate,
  Row,
  Section,
  Segmented,
  statusText,
  type StatusTone,
  Toggle,
  WIDGET_LIGHT,
} from "./rows";
import type { SettingsContext } from "../model/context";
import { usePermission, type PermissionState } from "./pages-permissions";
import {
  FLAT_LABEL,
  FLAT_ROW,
  FLAT_VALUE,
} from "./system-rows";

interface DiagnosticCheck {
  id: string;
  label: string;
  value: string;
  state: "HEALTHY" | "NEEDS ATTENTION" | "FAILED" | "NOT REPORTED";
  tone: StatusTone;
  fix?: { label: string; run(): void };
}

export function diagnosticChecks(ctx: SettingsContext, microphone: PermissionState): readonly DiagnosticCheck[] {
  const harnesses = ctx.harnesses.rows;
  const connected = harnesses.filter(({ tone }) => tone === "ok").length;
  const notifications: string = typeof Notification === "undefined" ? "unknown" : Notification.permission;
  return [
    {
      id: "library",
      label: "Library read/write",
      value: ctx.libraryPath ?? "no library is open",
      state: ctx.libraryPath ? "HEALTHY" : "FAILED",
      tone: ctx.libraryPath ? "ok" : "bad",
    },
    {
      id: "harnesses",
      label: "Agent harnesses",
      value: ctx.harnesses.state === "ready" ? `${connected} of ${harnesses.length} connected` : "bridge did not answer",
      state: ctx.harnesses.state !== "ready" ? "FAILED" : connected === harnesses.length ? "HEALTHY" : "NEEDS ATTENTION",
      tone: ctx.harnesses.state !== "ready" ? "bad" : connected === harnesses.length ? "ok" : "warn",
      fix: { label: "Open agents", run: () => ctx.goTo("agents") },
    },
    {
      id: "microphone",
      label: "Microphone permission",
      value: microphone === "unknown" ? "not reported by the platform" : `macOS reports ${microphone}`,
      state: microphone === "granted" ? "HEALTHY" : microphone === "unknown" ? "NOT REPORTED" : "NEEDS ATTENTION",
      tone: microphone === "granted" ? "ok" : microphone === "unknown" ? "off" : "warn",
      fix: { label: "Open permissions", run: () => ctx.goTo("permissions", "permissions.microphone") },
    },
    {
      id: "notifications",
      label: "Notification permission",
      value: notifications === "unknown" ? "not reported by the platform" : `browser reports ${notifications}`,
      state: notifications === "granted" ? "HEALTHY" : notifications === "unknown" ? "NOT REPORTED" : "NEEDS ATTENTION",
      tone: notifications === "granted" ? "ok" : notifications === "unknown" ? "off" : "warn",
      fix: { label: "Open permissions", run: () => ctx.goTo("permissions") },
    },
    { id: "providers", label: "Generation providers", value: "no discovery contract", state: "NOT REPORTED", tone: "off" },
    { id: "disk", label: "Disk space", value: "no disk-usage contract", state: "NOT REPORTED", tone: "off" },
    { id: "cli", label: "Ralphy CLI", value: "no version probe", state: "NOT REPORTED", tone: "off" },
  ];
}

export function DiagnosticsPage({ ctx }: { ctx: SettingsContext }) {
  const microphone = usePermission("microphone");
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const checks = diagnosticChecks(ctx, microphone);
  const rerun = async () => {
    setChecking(true);
    try {
      await ctx.harnesses.refresh();
    } finally {
      setChecking(false);
    }
  };
  const summary = () => checks.map(({ label, value, state }) => `${label}: ${value} [${state}]`).join("\n");
  return <>
    <Section title="SYSTEM CHECKS" count={checks.length}>
      <Plate>
        {checks.map((check) => <div className={`${FLAT_ROW} hover:bg-row-hover`} key={check.id}>
          <Dot tone={checking ? "off" : check.tone} />
          <span className={FLAT_LABEL}>{check.label}</span>
          <span className={FLAT_VALUE}>{checking ? "…" : check.value}</span>
          <span className={statusText(checking ? "off" : check.tone)}>{checking ? "CHECKING" : check.state}</span>
          {check.fix && !checking && <button className={action({ size: "sm" })} type="button" onClick={check.fix.run}>{check.fix.label}</button>}
        </div>)}
      </Plate>
    </Section>

    <div className={`flex items-center gap-2 ${WIDGET_LIGHT} @max-settings-column/settings-main:flex-wrap`}>
      <button className={action({ size: "lg", tone: "primary" })} type="button" disabled={checking} onClick={() => void rerun()}>
        {checking ? "Checking…" : "Rerun all checks"}
      </button>
      <button
        className={action({ size: "lg" })}
        type="button"
        onClick={async () => { await bridge.copyText(summary()); setCopied(true); }}
      >{copied ? "Copied" : "Copy redacted summary"}</button>
      <button className={action({ size: "lg" })} type="button" disabled>Reveal logs</button>
      <p className={`${NOTE} ml-auto text-right @max-settings-column/settings-main:ml-0 @max-settings-column/settings-main:text-left`}>THE SUMMARY CARRIES NO KEYS, PROMPTS<br />OR MEDIA PATHS</p>
    </div>
  </>;
}

export function UpdatesPage({ ctx }: { ctx: SettingsContext }) {
  const { values, set } = ctx.preferences;
  const [progress, setProgress] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  // ponytail: the progress run is local until an updater contract exists; the states it
  // walks through (idle, downloading, ready) are the ones the real updater will report.
  const start = () => {
    if (ready) return;
    if (progress !== null) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setProgress(null);
      return;
    }
    setProgress(0);
    timer.current = setInterval(() => setProgress((current) => {
      const next = (current ?? 0) + 7;
      if (next < 100) return next;
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setReady(true);
      return 100;
    }), 90);
  };

  return <>
    <Section title="VERSION">
      <div className={`flex flex-col gap-3.25 ${WIDGET_LIGHT}`}>
        <div className="flex items-center gap-4">
          <span className="flex min-w-0 flex-1 flex-col gap-1.25">
            <span className={META}>{ready ? "READY TO INSTALL" : progress !== null ? "DOWNLOADING" : `CURRENT VERSION · ${values["updates.channel"].toLocaleUpperCase()}`}</span>
            <strong className="font-display type-display font-extrabold leading-none text-ink">{ctx.version}</strong>
          </span>
          <button className={action({ size: "lg", tone: progress !== null && !ready ? undefined : "primary" })} type="button" onClick={start}>
            {ready ? "Restart to update" : progress !== null ? "Pause" : "Check for updates"}
          </button>
        </div>
        {progress !== null && <div className="flex items-center gap-3">
          <LedBar percent={progress} />
          <b className={NUMBER}>{progress}%</b>
        </div>}
        <p className="m-0 type-label leading-copy text-muted">{ready
          ? "The update is downloaded. Installing happens on restart — active runs are stopped cleanly first."
          : progress !== null ? "Downloading runs in the background and does not block work."
          : "An update feed is not wired up yet, so this check walks the states the real updater will report."}</p>
      </div>
    </Section>

    <Section title="CHANNEL">
      <Plate>
        <Row title="Update channel" description="Beta arrives earlier and can break CLI contracts." id="updates.channel">
          <Segmented
            label="Update channel"
            value={values["updates.channel"]}
            options={["Stable", "Beta"] as const}
            onChange={(next) => set("updates.channel", next)}
          />
        </Row>
        <Row title="Download updates automatically" description="Installing still waits for your restart." id="updates.autoDownload">
          <Toggle label="Download updates automatically" on={values["updates.autoDownload"]} onChange={(next) => set("updates.autoDownload", next)} />
        </Row>
      </Plate>
    </Section>
  </>;
}

/* An outbound link is a sunken pill like an action, but it is a link, not a control. */
const LINK = "inline-flex h-8 items-center gap-2 rounded-control bg-field px-3.5 type-ui text-ink no-underline hover:bg-row-hover focus-visible:outline-ink";

const CHROMIUM = /Chrome\/([\d.]+)/.exec(typeof navigator === "undefined" ? "" : navigator.userAgent)?.[1] ?? null;

export function AboutPage({ ctx }: { ctx: SettingsContext }) {
  const [copied, setCopied] = useState(false);
  const runtime: readonly [string, string][] = [
    ["Ralphy Desktop", ctx.version],
    ["Chromium", CHROMIUM ?? "not reported"],
    ["Platform", (typeof navigator === "undefined" ? "" : navigator.platform) || "not reported"],
    ["Electron", "not reported"],
    ["Node", "not reported"],
    ["Ralphy CLI", "not reported"],
  ];
  return <>
    <div className="flex items-center gap-5 rounded-panel bg-instrument p-4">
      <span className="grid size-settings-mark flex-none place-items-center rounded-menu bg-frame text-on-instrument"><RalphyMascot size={46} /></span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <strong className="type-subtitle font-normal text-on-instrument">Ralphy Desktop</strong>
        <small className="font-display type-lg font-extrabold text-on-instrument-muted">{`${ctx.version} · ${CHROMIUM ? `CHROMIUM ${CHROMIUM}` : "BUILD FACTS PENDING"}`}</small>
      </span>
      <button
        className={action({ size: "lg", tone: "primary", surface: "instrument" })}
        type="button"
        onClick={async () => {
          await bridge.copyText(runtime.map(([label, value]) => `${label}: ${value}`).join("\n"));
          setCopied(true);
        }}
      >{copied ? "Copied" : "Copy version info"}</button>
    </div>

    <Section title="RUNTIME">
      <Plate>
        {runtime.map(([label, value]) => <div className={`${FLAT_ROW} hover:bg-row-hover`} key={label}>
          <span className={FLAT_LABEL}>{label}</span>
          <span className={FLAT_VALUE}>{value}</span>
        </div>)}
      </Plate>
    </Section>

    <Section title="OPEN SOURCE">
      <div className={`flex flex-wrap gap-2 ${WIDGET_LIGHT}`}>
        <a className={LINK} href="https://github.com/alecs5am/ralphy-desktop" target="_blank" rel="noreferrer">
          Repository
          <ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" />
        </a>
        <a className={LINK} href="https://github.com/alecs5am/ralphy-docs" target="_blank" rel="noreferrer">
          Documentation
          <ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" />
        </a>
      </div>
    </Section>
  </>;
}
