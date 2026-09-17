/**
 * What the app is allowed to do, and the shell it does it in.
 *
 * A permission is read from the platform rather than remembered: the operator may change it in
 * System Settings at any time, and a remembered "granted" would be a claim the app cannot make.
 * The risk rows are the app's own gates, which is why they are a list here and not a paragraph.
 */
import { useEffect, useState } from "react";
import { useDesktopSystem } from "../model/use-desktop-system";


import {
  action,
  Plate,
  Row,
  Section,
  SettingsSelect,
  Status,
} from "./rows";
import type { SettingsContext } from "../model/context";

export type PermissionState = "granted" | "denied" | "prompt" | "unknown";

export function usePermission(name: "microphone"): PermissionState {
  const [state, setState] = useState<PermissionState>("unknown");
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const onChange = () => setState((status?.state ?? "unknown") as PermissionState);
    // Chromium answers this without prompting, so the row reports the real macOS grant.
    if (typeof navigator === "undefined" || !navigator.permissions) { setState("unknown"); return; }
    navigator.permissions.query({ name: name as PermissionName }).then((result) => {
      status = result;
      setState(result.state as PermissionState);
      result.addEventListener("change", onChange);
    }).catch(() => setState("unknown"));
    return () => status?.removeEventListener("change", onChange);
  }, [name]);
  return state;
}

export function PermissionsPage({ ctx }: { ctx: SettingsContext }) {
  const { values, set } = ctx.preferences;
  return <>
    <Section title="AGENT ACCESS">
      <Plate>
        <Row title="Default access for new chats" description="Existing conversations keep their own access mode. Change it in the chat composer." id="permissions.mode">
          <SettingsSelect label="Default access for new chats" value={values["permissions.mode"]} options={[{ value: "plan", label: "Read-only files" }, { value: "auto", label: "Workspace access" }, { value: "full", label: "Full access" }]} onChange={(next) => set("permissions.mode", next)} />
        </Row>
        <Row title="Read-only files" description="Codex uses its read-only sandbox. Claude uses Plan mode. Choose this when you want to inspect and plan before editing." />
        <Row title="Workspace access" description="Codex can write within its workspace sandbox without approval prompts. Claude uses its automatic permission mode. Provider restrictions still apply." />
        <Row title="Full access" description="Allows commands and file changes without the sandbox or approval prompts. This can include network requests, paid API calls and external publishing using available credentials." />
        <Row title="Connected tools" description="These modes control local file and command access. MCP tools keep the permissions granted in their provider; Ralphy does not add approval prompts for their external actions." />
      </Plate>
    </Section>
    <Section title="YOUR DATA"><Plate>
      <Row title="Local library" description="Projects, media and chat history are stored on this Mac. Connected agents and generation services receive the content needed for your requests." />
      <Row title="Diagnostics" description="Review a redacted system summary before sharing it. Your prompts and media are not included in the summary."><button className={action()} onClick={() => ctx.goTo("diagnostics")}>Open diagnostics</button></Row>
      <Row title="Provider credentials" description="Manage encrypted service keys and verify connections."><button className={action()} onClick={() => ctx.goTo("providers")}>Manage connections</button></Row>
    </Plate></Section>
  </>;
}

export function TerminalPage({ ctx }: { ctx: SettingsContext }) {
  const { info, error, refresh, busy } = useDesktopSystem();
  return <Section title="RUNTIME ENVIRONMENT"><Plate>
    <Row title="Shell" description="The shell inherited by this application process."><Status>{info?.shell ?? "Checking…"}</Status></Row>
    <Row title="Ralphy runtime" description="The runtime connected to your active library."><Status>{info?.versions.core ?? "No library open"}</Status></Row>
    <Row title="Agent tools" description="Each agent manages its own command execution and environment. Configure its login and tools under Agents."><button className={action()} onClick={() => ctx.goTo("agents")}>Open agents</button></Row>
    {error && <p role="alert">{error}</p>}
    <button className={action()} disabled={busy} onClick={() => void refresh()}>Refresh environment</button>
  </Plate></Section>;
}
