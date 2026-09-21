import { bridge } from "@/shared/api/ipc";
import { useDesktopSystem } from "../model/use-desktop-system";
/**
 * The three pages about the operator rather than the machine: what the app does by default, who
 * they are, and how it looks.
 *
 * Appearance states the system's own value beside every override, because a preference the app
 * inherits is not a preference the app owns -- an operator who set "match system" should be able
 * to see what the system currently says.
 */
import { useEffect, useMemo, useState } from "react";
import { FolderOpen } from "@/shared/ui/icons";

import { ProfileAvatar } from "@/shared/ui/ProfileAvatar";
import type { SettingsContext } from "../model/context";
import {
  FIELD,
  Plate,
  Row,
  Section,
  Segmented,
  Toggle,
  action,
} from "./rows";

/** System values the app inherits rather than owns; shown next to the override. Hosts
 *  without media queries (geometry harnesses) report false rather than throwing. */
function useSystemPreference(query: string): boolean {
  const media = useMemo(
    () => typeof window.matchMedia === "function" ? window.matchMedia(query) : null,
    [query],
  );
  const [matches, setMatches] = useState(media?.matches ?? false);
  useEffect(() => {
    if (!media) return;
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener("change", onChange);
    setMatches(media.matches);
    return () => media.removeEventListener("change", onChange);
  }, [media]);
  return matches;
}


export function GeneralPage({ ctx }: { ctx: SettingsContext }) {
  const { values, set } = ctx.preferences;
  const { info } = useDesktopSystem();
  const [error, setError] = useState<string | null>(null);
  return <>
    <Section title="CHAT"><Plate>
      <Row title="Send shortcut in agent chat" description="Shift + Enter always adds a new line." id="general.sendShortcut"><Segmented label="Send shortcut in agent chat" value={values["general.sendShortcut"]} options={["Enter", "⌘↩"] as const} onChange={(next) => set("general.sendShortcut", next)} /></Row>
      <Row title="Agent and model defaults" description="Choose a connected agent for new conversations."><button className={action()} onClick={() => ctx.goTo("agents")}>Manage agents</button></Row>
      <Row title="Access for new chats" description="New conversations start with the mode chosen in Permissions."><button className={action()} onClick={() => ctx.goTo("permissions")}>Agent access</button></Row>
    </Plate></Section>
    {ctx.workspace && ctx.onOpenWorkspaceSettings && <Section title={ctx.workspace.name}><Plate>
      <Row title="Memory" description="Saved preferences and knowledge for this workspace." id="general.memory"><button className={action()} onClick={() => ctx.onOpenWorkspaceSettings?.("memory")}>Manage memory</button></Row>
      <Row title="Context" description="Workspace instructions and reference material available to agents." id="general.context"><button className={action()} onClick={() => ctx.onOpenWorkspaceSettings?.("context")}>Manage context</button></Row>
    </Plate></Section>}
    <Section title="LIBRARY"><Plate>
      <Row title="Home Ralphy library" description={info?.libraryPath ?? "Reading library location…"} id="general.library"><button className={action()} disabled={!info?.libraryPath} onClick={() => void bridge.revealDesktopFolder("library").catch(() => setError("The library folder could not be opened."))}><FolderOpen size={14} />Show in Finder</button></Row>
      <Row title="Storage and cache" description="Inspect available disk space and clear disposable browser data."><button className={action()} onClick={() => ctx.goTo("storage")}>Open storage</button></Row>
      <Row title="Continue where you left off" description="Ralphy restores your workspace and open views when the application starts." />
    </Plate></Section>
    {error && <p role="alert">{error}</p>}
  </>;
}

export function ProfilePage({ ctx }: { ctx: SettingsContext }) {
  const { values, set } = ctx.preferences;
  return <Section title="LOCAL PROFILE">
    <Plate>
      <Row title="Avatar" description="Your generated identity, rendered on this Mac." flat>
        <span className="grid size-settings-avatar flex-none place-items-center overflow-hidden rounded-control bg-field font-code type-md text-muted"><ProfileAvatar rootPath={ctx.libraryPath ?? ""} size={56} round /></span>
      </Row>
      <Row title="Display name" description="Shown in the application sidebar and Settings." id="profile.displayName">
        <input
          className={FIELD}
          value={values["profile.displayName"]}
          placeholder="Not set"
          aria-label="Display name"
          onChange={(event) => set("profile.displayName", event.target.value)}
        />
      </Row>
      <Row title="Preferred name for agents" description="How an agent addresses you in replies. Optional." id="profile.preferredName">
        <input
          className={FIELD}
          value={values["profile.preferredName"]}
          placeholder="Not set"
          aria-label="Preferred name for agents"
          onChange={(event) => set("profile.preferredName", event.target.value)}
        />
      </Row>
    </Plate>
  </Section>;
}


export function AppearancePage({ ctx }: { ctx: SettingsContext }) {
  const { values, set } = ctx.preferences;
  const systemMotion = useSystemPreference("(prefers-reduced-motion: reduce)");
  return <>
    <Section title="THEME"><Plate>
      <Row title="Appearance" description="Applies immediately throughout the application." id="appearance.theme"><Segmented label="Theme" value={ctx.theme === "system" ? "System" : ctx.theme === "dark" ? "Dark" : "Light"} options={["System", "Dark", "Light"] as const} onChange={(next) => ctx.onThemeChange(next === "System" ? "system" : next === "Dark" ? "dark" : "light")} /></Row>
    </Plate></Section>
    <Section title="MOTION"><Plate>
      <Row title="Interface motion" description={systemMotion ? "Reduced by your system accessibility preference." : "Animate panels and transitions. Turn off for reduced motion."} id="appearance.motion"><Toggle label="Interface motion" on={values["appearance.motion"] && !systemMotion} onChange={(next) => set("appearance.motion", next)} /></Row>
    </Plate></Section>
  </>;
}

/* A conflict widget is a black widget, so its rows keep the on-instrument ink. */
