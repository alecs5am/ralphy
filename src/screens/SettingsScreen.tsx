import {
  ArrowLeft,
  Check,
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
import type { ThemePreference } from "../theme";

const categories = [
  { id: "general", label: "General", icon: Settings },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "providers", label: "Providers", icon: KeyRound },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "about", label: "About", icon: Info },
] as const;

type SettingsCategory = (typeof categories)[number]["id"];

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange(checked: boolean): void;
}) {
  return (
    <button
      className={`settings-toggle${checked ? " is-on" : ""}`}
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

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

function Segmented({
  value,
  values,
  className,
  onChange,
}: {
  value: string;
  values: string[];
  className?: string;
  onChange(value: string): void;
}) {
  return (
    <div className={`settings-segmented${className ? ` ${className}` : ""}`} role="group">
      {values.map((item) => (
        <button
          className={value === item ? "is-selected" : ""}
          type="button"
          aria-pressed={value === item}
          key={item}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function GeneralSettings({ rootPath }: { rootPath: string | null }) {
  const [restoreContext, setRestoreContext] = useState(true);
  const [revealGenerated, setRevealGenerated] = useState(true);
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
          <Toggle
            checked={restoreContext}
            label="Restore project context"
            onChange={setRestoreContext}
          />
        </SettingRow>
        <SettingRow
          title="Reveal generated media"
          description="Bring newly generated files into the active project view."
        >
          <Toggle
            checked={revealGenerated}
            label="Reveal generated media"
            onChange={setRevealGenerated}
          />
        </SettingRow>
      </SettingGroup>
    </>
  );
}

function ProfileSettings({ rootPath }: { rootPath: string | null }) {
  const fallback = rootPath ?? "/Users/ralphy/.ralphy";
  const [displayName, setDisplayName] = useState(profileIdentity(fallback));
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
        <input
          className="settings-input"
          value={displayName}
          aria-label="Display name"
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </SettingRow>
    </SettingGroup>
  );
}

function AppearanceSettings({
  theme,
  onThemeChange,
}: {
  theme: ThemePreference;
  onThemeChange(theme: ThemePreference): void;
}) {
  const [density, setDensity] = useState("Comfortable");
  const [motionEnabled, setMotionEnabled] = useState(true);
  return (
    <>
      <SettingGroup title="Interface">
        <SettingRow title="Theme" description="Neutral surfaces optimized for media.">
          <Segmented
            value={theme[0].toUpperCase() + theme.slice(1)}
            values={["System", "Light", "Dark"]}
            className="settings-theme-selector"
            onChange={(value) => onThemeChange(value.toLowerCase() as ThemePreference)}
          />
        </SettingRow>
        <SettingRow title="Density">
          <Segmented
            value={density}
            values={["Compact", "Comfortable"]}
            onChange={setDensity}
          />
        </SettingRow>
        <SettingRow title="Interface motion">
          <Toggle
            checked={motionEnabled}
            label="Interface motion"
            onChange={setMotionEnabled}
          />
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
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [connected, setConnected] = useState<string[]>([]);
  return (
    <SettingGroup title="Generation providers">
      {providers.map(([name, description, placeholder]) => (
        <div className="provider-row" key={name}>
          <span className="provider-mark">{name.slice(0, 2)}</span>
          <span className="provider-copy">
            <strong>{name}</strong>
            <small>{description}</small>
          </span>
          <input
            className="settings-input provider-key"
            type="password"
            autoComplete="off"
            aria-label={`${name} API key`}
            placeholder={placeholder}
            value={keys[name] ?? ""}
            onChange={(event) => setKeys((current) => ({
              ...current,
              [name]: event.target.value,
            }))}
          />
          <button
            className={`provider-connect${connected.includes(name) ? " is-connected" : ""}`}
            type="button"
            disabled={!keys[name]}
            onClick={() => setConnected((current) => (
              current.includes(name)
                ? current.filter((provider) => provider !== name)
                : [...current, name]
            ))}
          >
            {connected.includes(name) && <Check size={13} strokeWidth={1.7} />}
            {connected.includes(name) ? "Ready" : "Connect"}
          </button>
        </div>
      ))}
      <p className="settings-security-note">
        Keys are mock session values in this build and are never persisted.
      </p>
    </SettingGroup>
  );
}

function TerminalSettings() {
  const [shellMode, setShellMode] = useState("Login shell");
  const [links, setLinks] = useState(true);
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
          <Segmented
            value={shellMode}
            values={["Login shell", "Plain shell"]}
            onChange={setShellMode}
          />
        </SettingRow>
        <SettingRow title="Clickable links">
          <Toggle checked={links} label="Clickable links" onChange={setLinks} />
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
  onThemeChange(theme: ThemePreference): void;
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

  let content = <GeneralSettings rootPath={rootPath} />;
  if (active === "profile") content = <ProfileSettings rootPath={rootPath} />;
  if (active === "appearance") content = <AppearanceSettings theme={theme} onThemeChange={onThemeChange} />;
  if (active === "providers") content = <ProviderSettings />;
  if (active === "terminal") content = <TerminalSettings />;
  if (active === "about") content = <AboutSettings />;

  return (
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
  );
}
