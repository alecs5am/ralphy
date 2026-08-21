import {
  ArrowLeft,
  Info,
  KeyRound,
  Monitor,
  Palette,
  Search,
  Settings,
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
  { id: "about.version", backing: "package metadata", lifetime: "build", enabled: true, verification: "read-only value", disabledReason: null },
] as const satisfies readonly SettingsCapability[];

const capability = (id: string) => SETTINGS_CAPABILITIES.find((item) => item.id === id)!;

function UnsupportedControl({ id, label }: { id: string; label: string }) {
  const item = capability(id);
  return <span className="grid justify-items-end gap-1">
    <button className="settings-disabled-control min-h-8 rounded-full bg-surface-sunken px-3 text-xs text-muted" type="button" aria-disabled="true" aria-describedby={`${id}-reason`} onClick={(event) => event.preventDefault()}>{label}</button>
    <small className="max-w-64 text-right text-[10px] leading-snug text-muted" id={`${id}-reason`}>{item.disabledReason}</small>
  </span>;
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
    <section className="settings-section grid gap-2">
      <h2 className="m-0 px-2 font-mono text-[10px] uppercase tracking-[.1em] text-muted">{title}</h2>
      <div className="settings-group grid gap-1 rounded-panel border-0 bg-surface p-2">{children}</div>
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
    <div className="settings-row grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-6 rounded-[14px] border-0 px-4 py-3 hover:bg-surface-hover">
      <span className="settings-row-copy grid min-w-0 gap-0.5">
        <strong className="text-sm text-ink">{title}</strong>
        {description && <small className="max-w-xl text-xs leading-snug text-muted">{description}</small>}
      </span>
      <span className="settings-row-control flex items-center justify-end">{children}</span>
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
          <span className="settings-muted font-mono text-[10px] text-muted">Automatic</span>
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
        <div className="settings-profile-hero flex items-center gap-3 rounded-[14px] border-0 bg-surface-sunken px-4 py-4">
        <ProfileAvatar rootPath={fallback} size={42} />
        <span className="grid gap-0.5">
          <strong className="text-sm text-ink">{displayName || "Ralphy creator"}</strong>
          <small className="text-xs text-muted">Used only to personalize this Mac.</small>
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
          <SelectMenu className="h-8 min-w-36 rounded-full bg-instrument px-3 text-on-instrument" overlayOwner="settings.appearance" ariaLabel="Theme" value={theme} options={[
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
        <div className="provider-row grid min-h-16 grid-cols-[32px_minmax(120px,1fr)_auto_auto] items-center gap-3 rounded-[14px] border-0 px-3 py-2 hover:bg-surface-hover" key={name}>
          <span className="provider-mark grid size-8 place-items-center rounded-[10px] bg-surface-sunken font-mono text-[10px] text-muted">{name.slice(0, 2)}</span>
          <span className="provider-copy grid min-w-0 gap-0.5">
            <strong className="truncate text-sm text-ink">{name}</strong>
            <small className="truncate text-xs text-muted">{description}</small>
          </span>
          <UnsupportedControl id="providers.keys" label={placeholder} />
          <UnsupportedControl id="providers.connect" label="Unavailable" />
        </div>
      ))}
      <p className="settings-security-note m-0 rounded-[14px] bg-surface-sunken px-4 py-3 text-xs text-muted">
        Provider credentials are configured outside Settings in this release.
      </p>
    </SettingGroup>
  );
}

function AboutSettings() {
  return (
    <SettingGroup title="Ralphy Media">
      <div className="settings-about flex items-center gap-3 rounded-[14px] border-0 bg-surface-sunken px-4 py-4">
        <span className="settings-about-mark grid size-12 place-items-center rounded-[14px] border-0 bg-instrument-raised">
          <RalphyMascot size={46} />
        </span>
        <span className="grid gap-0.5">
          <strong className="text-sm text-ink">Ralphy Media 0.1.0</strong>
          <small className="text-xs text-muted">Native-speed review workbench for generated media.</small>
        </span>
      </div>
      <SettingRow title="Runtime">
        <span className="settings-muted text-xs text-muted">Electron · macOS</span>
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
  if (active === "about") content = <AboutSettings />;

  return (
    <InstrumentScreenRoot descriptor={instrumentDescriptor} state="ready">
    <motion.div
      className="settings-screen grid h-full w-full grid-cols-[240px_minmax(0,1fr)] gap-2 overflow-hidden bg-desk p-2 text-ink"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: [0.2, 0, 0.2, 1] }}
    >
      <aside className="settings-sidebar flex min-h-0 flex-col overflow-hidden rounded-panel border-0 bg-instrument text-on-instrument">
        <div className="settings-window-bar flex h-12 shrink-0 items-center px-2">
          <span className="settings-traffic-space" />
          <button className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs text-on-instrument-muted hover:bg-instrument-hover hover:text-on-instrument" type="button" onClick={onBack}>
            <ArrowLeft size={14} strokeWidth={1.5} />
            Back to app
          </button>
        </div>
        <label className="settings-search mx-2 mb-3 flex h-9 shrink-0 items-center gap-2 rounded-full border-0 bg-instrument-raised px-3 text-on-instrument-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-on-instrument">
          <Search size={14} strokeWidth={1.5} />
          <input className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs text-on-instrument outline-none placeholder:text-on-instrument-muted"
            value={query}
            placeholder="Search settings"
            aria-label="Search settings"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <nav className="settings-nav grid min-h-0 gap-1 overflow-y-auto px-2" aria-label="Settings categories">
          {visibleCategories.map(({ id, label, icon: Icon }) => (
            <button
              className={`flex h-9 w-full items-center gap-2 rounded-full px-3 text-left text-xs ${active === id ? "is-active bg-surface text-ink" : "text-on-instrument-muted hover:bg-instrument-hover hover:text-on-instrument"}`}
              type="button"
              key={id}
              onClick={() => setActive(id)}
            >
              <Icon size={15} strokeWidth={1.5} />
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-sidebar-product mt-auto flex items-center gap-2 px-4 py-3 text-on-instrument-muted">
          <span><RalphyMascot size={26} /></span>
          <small>Ralphy Media</small>
        </div>
      </aside>
      <main className="settings-main min-h-0 min-w-0 overflow-y-auto rounded-panel bg-desk">
        <header className="settings-main-header sticky top-0 z-10 mx-auto flex h-16 w-full max-w-3xl items-end gap-3 bg-desk px-8 pb-3 backdrop-blur-none">
          <h1 className="m-0 text-xl text-ink">{title}</h1>
          {active === "general" && (
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[.08em] text-muted">
              <Monitor size={13} strokeWidth={1.5} />
              This Mac
            </span>
          )}
        </header>
        <div className="settings-content mx-auto grid w-full max-w-3xl gap-6 px-8 pb-16 pt-4" key={active}>
          {content}
        </div>
      </main>
    </motion.div>
    </InstrumentScreenRoot>
  );
}
