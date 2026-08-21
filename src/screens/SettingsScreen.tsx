import {
  ArrowLeft,
  Info,
  KeyRound,
  Monitor,
  Palette,
  Search,
  Settings,
  TerminalSquare,
  UserRound,
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";

import { ProfileAvatar, profileIdentity } from "../components/ProfileAvatar";
import { RalphyMascot } from "../components/RalphyMascot";
import { SelectMenu } from "../components/ui/SelectMenu";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "../instrument/screen-state-registry";
import type { ThemePreference } from "../instrument/types";

const categories = [
  { id: "general", label: "General", icon: Settings },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "providers", label: "Providers", icon: KeyRound },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "about", label: "About", icon: Info },
] as const;

export type SettingsCategory = (typeof categories)[number]["id"];
export const SETTINGS_CATEGORY_IDS = categories.map(({ id }) => id);

export interface SettingsCapability {
  id: string;
  backing: string;
  lifetime: "persistent" | "root-scoped" | "runtime" | "system" | "build" | "none";
  enabled: boolean;
  verification: string;
  disabledReason: string | null;
}

export const SETTINGS_CAPABILITIES = [
  { id: "general.root", backing: "WorkbenchPreferences.rootPath", lifetime: "persistent", enabled: true, verification: "read-only value", disabledReason: null },
  { id: "general.restore", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "No persisted preference exists in this release." },
  { id: "general.reveal", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "No persisted preference exists in this release." },
  { id: "profile.identity", backing: "active root identity", lifetime: "root-scoped", enabled: true, verification: "derived render", disabledReason: null },
  { id: "profile.displayName", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "Profile identity is derived from the active library." },
  { id: "appearance.theme", backing: "WorkbenchPreferences.theme", lifetime: "persistent", enabled: true, verification: "two-launch", disabledReason: null },
  { id: "appearance.density", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "Interface density is fixed in this release." },
  { id: "appearance.motion", backing: "matchMedia(prefers-reduced-motion)", lifetime: "system", enabled: false, verification: "computed media", disabledReason: "Motion follows macOS Reduced Motion in this release." },
  { id: "providers.keys", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "Provider credentials are configured outside Settings in this release." },
  { id: "providers.connect", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "Provider connections are configured outside Settings in this release." },
  { id: "terminal.workingDirectory", backing: "active root", lifetime: "root-scoped", enabled: true, verification: "read-only value", disabledReason: null },
  { id: "terminal.shell", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "Terminal shell mode is not configurable in this release." },
  { id: "terminal.links", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "Terminal link handling is not configurable in this release." },
  { id: "terminal.toggle", backing: "existing Cmd+J action", lifetime: "runtime", enabled: true, verification: "invoke and observe panel", disabledReason: null },
  { id: "about.version", backing: "package metadata", lifetime: "build", enabled: true, verification: "read-only value", disabledReason: null },
] as const satisfies readonly SettingsCapability[];

const capability = (id: string) => SETTINGS_CAPABILITIES.find((item) => item.id === id)!;

function UnsupportedControl({ id, label }: { id: string; label: string }) {
  const item = capability(id);
  return <button className="settings-disabled-control" type="button" aria-disabled="true" title={item.disabledReason ?? undefined} onClick={(event) => event.preventDefault()}>{label}</button>;
}

export const settingsInstrumentStates = categories.map(({ id, label }) => defineInstrumentScreenStates({
  routeKey: `settings.${id}`,
  states: ["ready"],
  rootMarker: `settings-${id}`,
  landmarks: [label, "Settings categories"],
} as const));

function SettingGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      <div className="settings-group">{children}</div>
    </section>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row-copy">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
      <span className="settings-row-control">{children}</span>
    </div>
  );
}

function GeneralSettings({ rootPath }: { rootPath: string | null }) {
  return (
    <>
      <SettingGroup title="Library">
        <SettingRow
          title="Home Ralphy library"
          description={rootPath ?? "~/.ralphy"}
        >
          <span className="settings-muted">Automatic</span>
        </SettingRow>
      </SettingGroup>
      <SettingGroup title="Startup">
        <SettingRow
          title="Restore project context"
          description="Open the last workspace and project after launch."
        >
          <UnsupportedControl id="general.restore" label="Unavailable" />
        </SettingRow>
        <SettingRow
          title="Reveal generated media"
          description="Bring newly generated files into the active project view."
        >
          <UnsupportedControl id="general.reveal" label="Unavailable" />
        </SettingRow>
      </SettingGroup>
    </>
  );
}

function ProfileSettings({ rootPath }: { rootPath: string | null }) {
  const fallback = rootPath ?? "/Users/ralphy/.ralphy";
  const displayName = profileIdentity(fallback);
  return (
    <SettingGroup title="Local profile">
      <div className="settings-profile-hero">
        <ProfileAvatar rootPath={fallback} size={42} />
        <span>
          <strong>{displayName || "Ralphy creator"}</strong>
          <small>Used only to personalize this Mac.</small>
        </span>
      </div>
      <SettingRow title="Display name">
        <UnsupportedControl id="profile.displayName" label={displayName || "Ralphy creator"} />
      </SettingRow>
    </SettingGroup>
  );
}

function AppearanceSettings({
  theme,
  onThemeChange,
}: {
  theme: ThemePreference;
  onThemeChange(value: ThemePreference): void;
}) {
  return (
    <>
      <SettingGroup title="Interface">
        <SettingRow title="Theme" description="Neutral surfaces optimized for media.">
          <SelectMenu overlayOwner="settings.appearance" ariaLabel="Theme" value={theme} options={[
            { value: "system", label: "System" },
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]} onValueChange={onThemeChange} />
        </SettingRow>
        <SettingRow title="Density">
          <UnsupportedControl id="appearance.density" label="Fixed" />
        </SettingRow>
        <SettingRow title="Interface motion">
          <UnsupportedControl id="appearance.motion" label="Follows macOS" />
        </SettingRow>
      </SettingGroup>
    </>
  );
}

const providers = [
  ["OpenRouter", "Models and text generation", "sk-or-..."],
  ["ElevenLabs", "Voice generation", "sk_..."],
  ["HeyGen", "Avatar video generation", "hg_..."],
  ["OpenAI", "Images and text generation", "sk-..."],
] as const;

function ProviderSettings() {
  return (
    <SettingGroup title="Generation providers">
      {providers.map(([name, description, placeholder]) => (
        <div className="provider-row" key={name}>
          <span className="provider-mark">{name.slice(0, 2)}</span>
          <span className="provider-copy">
            <strong>{name}</strong>
            <small>{description}</small>
          </span>
          <UnsupportedControl id="providers.keys" label={placeholder} />
          <UnsupportedControl id="providers.connect" label="Unavailable" />
        </div>
      ))}
      <p className="settings-security-note">
        Keys are mock session values in this build and are never persisted.
      </p>
    </SettingGroup>
  );
}

function TerminalSettings() {
  return (
    <>
      <SettingGroup title="Shell">
        <SettingRow
          title="Working directory"
          description="New global terminals start in the active .ralphy root."
        >
          <span className="settings-mono">.ralphy</span>
        </SettingRow>
        <SettingRow
          title="Shell startup"
          description="Uses $SHELL and preserves your prompt configuration."
        >
          <UnsupportedControl id="terminal.shell" label="Login shell" />
        </SettingRow>
        <SettingRow title="Clickable links">
          <UnsupportedControl id="terminal.links" label="Unavailable" />
        </SettingRow>
      </SettingGroup>
      <SettingGroup title="Shortcuts">
        <SettingRow title="Toggle terminal panel">
          <kbd className="settings-shortcut">⌘ J</kbd>
        </SettingRow>
        <SettingRow title="Close terminal tab">
          <span className="settings-muted">Middle click</span>
        </SettingRow>
      </SettingGroup>
    </>
  );
}

function AboutSettings() {
  return (
    <SettingGroup title="Ralphy Media">
      <div className="settings-about">
        <span className="settings-about-mark">
          <RalphyMascot size={46} />
        </span>
        <span>
          <strong>Ralphy Media 0.1.0</strong>
          <small>Native-speed review workbench for generated media.</small>
        </span>
      </div>
      <SettingRow title="Runtime">
        <span className="settings-muted">Electron · macOS</span>
      </SettingRow>
    </SettingGroup>
  );
}

export function SettingsScreen({
  rootPath,
  theme,
  onThemeChange,
  onBack,
}: {
  rootPath: string | null;
  theme: ThemePreference;
  onThemeChange(value: ThemePreference): void;
  onBack(): void;
}) {
  const [active, setActive] = useState<SettingsCategory>("general");
  const [query, setQuery] = useState("");
  const visibleCategories = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle
      ? categories.filter(({ label }) => label.toLocaleLowerCase().includes(needle))
      : categories;
  }, [query]);
  const title = categories.find((category) => category.id === active)?.label ?? "Settings";
  const instrumentDescriptor = settingsInstrumentStates.find(({ routeKey }) => routeKey === `settings.${active}`)!;

  let content = <GeneralSettings rootPath={rootPath} />;
  if (active === "profile") content = <ProfileSettings rootPath={rootPath} />;
  if (active === "appearance") content = <AppearanceSettings theme={theme} onThemeChange={onThemeChange} />;
  if (active === "providers") content = <ProviderSettings />;
  if (active === "terminal") content = <TerminalSettings />;
  if (active === "about") content = <AboutSettings />;

  return (
    <InstrumentScreenRoot descriptor={instrumentDescriptor} state="ready">
    <motion.div
      className="settings-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: [0.2, 0, 0.2, 1] }}
    >
      <aside className="settings-sidebar">
        <div className="settings-window-bar">
          <span className="settings-traffic-space" />
          <button type="button" onClick={onBack}>
            <ArrowLeft size={14} strokeWidth={1.5} />
            Back to app
          </button>
        </div>
        <label className="settings-search">
          <Search size={14} strokeWidth={1.5} />
          <input
            value={query}
            placeholder="Search settings"
            aria-label="Search settings"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <nav className="settings-nav" aria-label="Settings categories">
          {visibleCategories.map(({ id, label, icon: Icon }) => (
            <button
              className={active === id ? "is-active" : ""}
              type="button"
              key={id}
              onClick={() => setActive(id)}
            >
              <Icon size={15} strokeWidth={1.5} />
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-sidebar-product">
          <span><RalphyMascot size={26} /></span>
          <small>Ralphy Media</small>
        </div>
      </aside>
      <main className="settings-main">
        <header className="settings-main-header">
          <h1>{title}</h1>
          {active === "general" && (
            <span>
              <Monitor size={13} strokeWidth={1.5} />
              This Mac
            </span>
          )}
        </header>
        <div className="settings-content" key={active}>
          {content}
        </div>
      </main>
    </motion.div>
    </InstrumentScreenRoot>
  );
}
