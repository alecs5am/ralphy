import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const styles = ["reset.css", "tokens.css", "app.css", "workbench.css"]
  .map((file) => readFileSync(join(process.cwd(), "src/styles", file), "utf8"))
  .join("\n");
const renderer = readdirSync(join(process.cwd(), "src"), {
  recursive: true,
  withFileTypes: true,
})
  .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
  .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"))
  .join("\n");

describe("design system contract", () => {
  test("uses only the supplied type scale and regular weight", () => {
    expect(styles).not.toMatch(/font-size:\s*(?:9|10)px/);
    expect(styles).not.toContain("font-weight: 500");
    expect(styles).not.toContain("text-transform: uppercase");
    expect(styles).not.toMatch(/letter-spacing:\s*-/);
  });

  test("names the responsive controls container and preserves round pills", () => {
    expect(styles).toContain("container-name: project-controls");
    expect(styles).toContain("@container project-controls");
    expect(styles).toMatch(/\.filter-chip,[\s\S]*corner-shape:\s*round/);
  });

  test("uses the approved neutral surfaces and larger smooth radii", () => {
    expect(styles).toMatch(/--canvas:\s*#181818/);
    expect(styles).toMatch(/--raised:\s*#2d2d2d/);
    expect(styles).toMatch(/--radius-md:\s*10px/);
    expect(styles).toMatch(/\.main-header\s*\{[^}]*border-bottom:\s*0/s);
    expect(styles).toMatch(/\.asset-modal-surface,[\s\S]*corner-shape:\s*squircle/);
  });

  test("resets browser chrome without applying a global accent focus ring", () => {
    const main = readFileSync(join(process.cwd(), "src/main.tsx"), "utf8");
    const resetPath = join(process.cwd(), "src/styles/reset.css");
    expect(existsSync(resetPath)).toBe(true);
    const reset = existsSync(resetPath) ? readFileSync(resetPath, "utf8") : "";

    expect(main).toContain('import "./styles/reset.css"');
    expect(reset).toContain("box-sizing: border-box");
    expect(reset).toMatch(/:focus-visible\s*\{[^}]*outline:\s*none/s);
    expect(styles).not.toMatch(
      /button:focus-visible,\s*input:focus-visible,\s*textarea:focus-visible,\s*select:focus-visible\s*\{[^}]*(?:--ring-focus|var\(--accent\))/s,
    );
    expect(styles).not.toMatch(
      /(?:focus-visible|focus-within)[^{]*\{[^}]*var\(--accent\)/s,
    );
  });

  test("uses headless selectors and panel shortcuts", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    expect(renderer).not.toMatch(/<select(?:\s|>)/);
    expect(renderer).toContain("@radix-ui/react-select");
    expect(renderer).toContain('role="listbox"');
    expect(renderer).toContain('role="slider"');
    expect(renderer).toContain('aria-label="Toggle sidebar"');
    expect(renderer).toContain('aria-label="Toggle right panel"');
    expect(renderer).toContain('aria-label="Toggle bottom panel"');
    expect(app).toContain("if (event.repeat) return");
    expect(app).toContain('command && key === "b"');
    expect(app).toContain('command && key === "j"');
    expect(app).not.toContain('commandOption && key === "b"');
  });

  test("provides searchable workspace navigation and resizable utility panels", () => {
    expect(renderer).toContain('aria-label="Search workspaces"');
    expect(renderer).toContain('aria-activedescendant');
    expect(renderer).toContain("closeAndRestoreFocus");
    expect(renderer).toContain('ariaLabel="Resize sidebar"');
    expect(renderer).toContain('ariaLabel="Resize right panel"');
    expect(renderer).toContain('ariaLabel="Resize bottom panel"');
    expect(renderer).toContain("onLostPointerCapture");
    expect(renderer).toContain("breadcrumb-button");
    expect(renderer).toContain("createPortal");
    expect(styles).toMatch(
      /\.workspace-picker-popover\s*\{[^}]*position:\s*fixed/s,
    );
    expect(styles).toMatch(
      /\.workspace-picker-search:focus-within\s*\{[^}]*box-shadow:\s*none/s,
    );
    expect(styles).toMatch(
      /\.breadcrumbs\s*\{[^}]*-webkit-app-region:\s*no-drag/s,
    );
    expect(styles).toMatch(/button:not\(:disabled\)[^{]*\{[^}]*cursor:\s*pointer/s);
  });

  test("transfers the approved dither workspace hero and project identity system", () => {
    const picker = readFileSync(
      join(process.cwd(), "src/components/WorkspacePicker.tsx"),
      "utf8",
    );
    const sidebar = readFileSync(
      join(process.cwd(), "src/components/ContextSidebar.tsx"),
      "utf8",
    );
    const profile = readFileSync(
      join(process.cwd(), "src/components/ProfileMenu.tsx"),
      "utf8",
    );

    expect(picker).toContain('className="workspace-hero"');
    expect(picker).toContain("workspace-hero-field-hi");
    expect(picker).toContain("selected?.unitCount");
    expect(picker).toContain("selected?.sharedCount");
    expect(picker).not.toContain("basename(rootPath)");
    expect(picker).not.toContain("workspace-hero-pill");
    expect(picker).toContain("workspace-option-field");
    expect(picker).toContain("style={workspaceDitherVars(workspace.name)}");
    expect(sidebar).toContain("projectGlyphVars(project.name)");
    expect(sidebar).toContain("projectGlyphSlot(project.name)");
    expect(sidebar).toContain("data-glyph=");
    expect(picker).toContain("workspaceDitherVars(selected?.name ?? value)");
    expect(sidebar).toContain("sidebar-row-field");
    expect(sidebar).not.toContain("sidebar-mascot-peek");
    expect(sidebar).not.toContain('title="Filter projects"');
    expect(profile).toContain(".ralphy library</small>");
    expect(styles).toContain("--dither-op: 1");
    expect(styles).toMatch(
      /\.workspace-hero\s*\{[^}]*width:\s*calc\(100% - 24px\)/s,
    );
    expect(styles).toMatch(
      /\.sidebar-row\.is-selected::after\s*\{[^}]*linear-gradient/s,
    );
    expect(styles).toMatch(
      /\.project-glyph-mark\s*\{[^}]*display:\s*block/s,
    );
    expect(styles).toMatch(
      /\.sidebar-row-field\s*\{[^}]*z-index:\s*0/s,
    );
    expect(styles).toMatch(
      /\.sidebar-row\.is-selected::after\s*\{[^}]*z-index:\s*1/s,
    );
    expect(styles).toMatch(
      /\.sidebar-row\.is-selected\s*>\s*\*:not\(\.sidebar-row-field\)\s*\{[^}]*z-index:\s*2/s,
    );
    expect(styles).toMatch(
      /\.workspace-option-field\s*\{[^}]*row-field\.png/s,
    );
    for (let slot = 1; slot <= 8; slot += 1) {
      expect(styles).toContain(`--p${slot}:`);
      expect(styles).toContain(`.project-glyph[data-glyph="${slot}"]`);
      expect(
        existsSync(join(process.cwd(), `public/assets/dither/g${slot}.png`)),
      ).toBe(true);
    }
    for (const asset of [
      "orb-22.png",
      "ribbon-card.png",
      "ribbon-card-hi.png",
      "row-field.png",
    ]) {
      expect(existsSync(join(process.cwd(), "public/assets/dither", asset))).toBe(
        true,
      );
    }
  });

  test("shows a paced Ralphy welcome before revealing the workbench", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    const welcomePath = join(process.cwd(), "src/components/WelcomeScreen.tsx");
    expect(existsSync(welcomePath)).toBe(true);
    const welcome = existsSync(welcomePath) ? readFileSync(welcomePath, "utf8") : "";

    expect(app).not.toContain("Opening library…");
    expect(app).toContain("WELCOME_MINIMUM_MS");
    expect(app).toContain("setWelcomeExiting(true)");
    expect(welcome).toContain("Howdy, partner!");
    expect(welcome).toContain("Workspace index");
    expect(welcome).toContain("Media workbench");
    expect(styles).toContain(".welcome-screen.is-exiting");
  });

  test("opens a global multi-provider chat with Cmd+R", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    const main = readFileSync(join(process.cwd(), "electron/main.ts"), "utf8");
    const preload = readFileSync(join(process.cwd(), "electron/preload.ts"), "utf8");
    const panels = readFileSync(
      join(process.cwd(), "src/components/UtilityPanels.tsx"),
      "utf8",
    );

    expect(main).toContain('input.key.toLocaleLowerCase() === "r"');
    expect(main).toContain("event.preventDefault()");
    expect(preload).toContain("onToggleRightPanel");
    expect(app).toMatch(
      /bridge\.onToggleRightPanel\(\(\)\s*=>\s*setRightPanelVisible\(\(visible\)\s*=>\s*!visible\)\)/,
    );
    expect(app).toContain("useAgentChat");
    expect(app).toContain("<AgentChatPanel");
    expect(app).not.toContain("<RightPanelSummary");
    expect(panels).toContain("AgentChatPanel");
    expect(panels).toContain("AgentChatMenu");
    expect(panels).toContain("AgentProviderMenu");
    expect(panels).toContain("AgentModelMenu");
    expect(panels).toContain('label: "Codex"');
    expect(panels).toContain('label: "OpenRouter"');
    expect(panels).not.toContain("<select");
    expect(panels).toContain("AiBrandIcon");
    expect(styles).toMatch(
      /\.utility-right-panel\s*\{[^}]*border-left:\s*1px solid var\(--line\)/s,
    );
    expect(styles).toMatch(/\.agent-composer\s*\{[^}]*background:\s*var\(--raised\)/s);
    expect(styles).toMatch(
      /\.agent-composer textarea\s*\{[^}]*border:\s*0[^}]*background:\s*transparent/s,
    );
  });

  test("exposes bounded terminal IPC and packages the native PTY runtime", () => {
    const main = readFileSync(join(process.cwd(), "electron/main.ts"), "utf8");
    const preload = readFileSync(join(process.cwd(), "electron/preload.ts"), "utf8");
    const types = readFileSync(
      join(process.cwd(), "electron/media/types.ts"),
      "utf8",
    );
    const buildElectron = readFileSync(
      join(process.cwd(), "scripts/build-electron.mjs"),
      "utf8",
    );
    const packageMac = readFileSync(
      join(process.cwd(), "scripts/package-mac.mjs"),
      "utf8",
    );
    const smoke = readFileSync(
      join(process.cwd(), "scripts/smoke-electron.mjs"),
      "utf8",
    );

    expect(types).toContain("createTerminal");
    expect(types).toContain("writeTerminal");
    expect(types).toContain("resizeTerminal");
    expect(types).toContain("killTerminal");
    expect(types).toContain("onTerminalEvent");
    expect(preload).toContain("TERMINAL_CHANNELS");
    expect(main).toContain("new TerminalManager");
    expect(main).toContain("assertTrustedSender");
    expect(main).toContain("mediaState.captureActive()");
    expect(main).toContain("terminalManager.dispose()");
    expect(buildElectron).toMatch(/external:\s*\[[^\]]*"node-pty"/s);
    expect(packageMac).toContain('join(root, "node_modules/node-pty")');
    expect(packageMac).toContain("spawn-helper");
    expect(packageMac).toContain("chmod");
    expect(main).toContain("window.ralphy?.createTerminal");
    expect(smoke).toContain("RALPHY_TERMINAL_BRIDGE_READY");
  });

  test("keeps a persistent xterm workspace with draggable resizable splits", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    const controller = readFileSync(
      join(process.cwd(), "src/terminal/controller.ts"),
      "utf8",
    );
    const workspace = readFileSync(
      join(process.cwd(), "src/components/terminal/TerminalWorkspace.tsx"),
      "utf8",
    );
    const pane = readFileSync(
      join(process.cwd(), "src/components/terminal/TerminalPane.tsx"),
      "utf8",
    );
    const utilityPanels = readFileSync(
      join(process.cwd(), "src/components/UtilityPanels.tsx"),
      "utf8",
    );
    const terminalStyles = readFileSync(
      join(process.cwd(), "src/styles/terminal.css"),
      "utf8",
    );
    const main = readFileSync(join(process.cwd(), "src/main.tsx"), "utf8");

    expect(controller).toContain("new Terminal");
    expect(controller).toContain("new FitAddon");
    expect(controller).toContain("new WebLinksAddon");
    expect(controller).toContain('cursorStyle: "bar"');
    expect(controller).toContain(
      'fontFamily: \'"JetBrainsMono Nerd Font Mono", "JetBrains Mono", Menlo, monospace\'',
    );
    expect(controller).not.toContain('fontFamily: \'"AWS Diatype Mono"');
    expect(utilityPanels).not.toContain('className="bottom-panel-header"');
    expect(terminalStyles).toMatch(/\.terminal-workspace\s*\{[^}]*height:\s*100%/s);
    expect(pane).toContain("new ResizeObserver");
    expect(workspace).toContain("bridge.onTerminalEvent");
    expect(workspace).toContain("bridge.killTerminal");
    expect(pane).toContain("event.button !== 1");
    expect(pane).toContain("application/x-ralphy-terminal-tab");
    expect(pane).toContain('["top", "right", "bottom", "left"]');
    expect(workspace).toContain("setPointerCapture");
    expect(workspace).toContain("onLostPointerCapture");
    expect(app).toContain("visible={bottomPanelVisible}");
    expect(app).toContain("Math.floor(viewport.height * 0.5)");
    expect(workspace).toContain("@xterm/xterm/css/xterm.css");
    expect(app).toContain("loadSettingsScreen");
  });

  test("opens app-level settings from a custom profile popover", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    const profileMenu = readFileSync(
      join(process.cwd(), "src/components/ProfileMenu.tsx"),
      "utf8",
    );
    const settings = readFileSync(
      join(process.cwd(), "src/screens/SettingsScreen.tsx"),
      "utf8",
    );
    const preferences = readFileSync(
      join(process.cwd(), "src/state/workbench.ts"),
      "utf8",
    );

    expect(profileMenu).toContain("createPortal");
    expect(profileMenu).toContain('role="menu"');
    expect(profileMenu).toContain("Settings");
    expect(profileMenu).toContain("closeAndRestoreFocus");
    expect(app).toContain('command && event.key === ","');
    expect(app).toContain("<SettingsScreen");
    expect(app).toContain("onBack={() => setSettingsVisible(false)}");
    for (const category of [
      "General",
      "Profile",
      "Appearance",
      "Providers",
      "Terminal",
      "About",
    ]) {
      expect(settings).toContain(`"${category}"`);
    }
    expect(settings).toContain("Change .ralphy library");
    expect(settings).toContain('type="password"');
    expect(settings).toContain('autoComplete="off"');
    expect(preferences).not.toMatch(/apiKey|providerKey|elevenlabs|openrouter/i);
  });

  test("uses the Ralphy mascot and a neutral dot-grid media stage", () => {
    const mascot = readFileSync(
      join(process.cwd(), "public/assets/ralphy-mascot.svg"),
      "utf8",
    );
    const welcome = readFileSync(
      join(process.cwd(), "src/components/WelcomeScreen.tsx"),
      "utf8",
    );
    const sidebar = readFileSync(
      join(process.cwd(), "src/components/ContextSidebar.tsx"),
      "utf8",
    );
    const settings = readFileSync(
      join(process.cwd(), "src/screens/SettingsScreen.tsx"),
      "utf8",
    );
    const terminal = readFileSync(
      join(process.cwd(), "src/components/terminal/TerminalWorkspace.tsx"),
      "utf8",
    );

    expect(mascot).toContain('mask id="eyes"');
    expect(sidebar).not.toContain("<RalphyMascot");
    expect(settings).toContain("<RalphyMascot");
    expect(terminal).toContain("<RalphyMascot");
    expect(welcome).toContain("<RalphyMascot");
  });

  test("keeps library switching in the profile and panel toggles in requested order", () => {
    const titlebar = readFileSync(
      join(process.cwd(), "src/components/Titlebar.tsx"),
      "utf8",
    );
    expect(titlebar).not.toContain("MoreHorizontal");
    expect(titlebar).not.toContain("Change library");
    expect(titlebar.indexOf('aria-label="Toggle bottom panel"')).toBeLessThan(
      titlebar.indexOf('aria-label="Toggle right panel"'),
    );
    const main = readFileSync(join(process.cwd(), "electron/main.ts"), "utf8");
    expect(main).toContain("trafficLightPosition");
    expect(main).toContain("setWindowOpenHandler");
    expect(main).toContain('target.protocol === "http:"');
    expect(main).toContain('target.protocol === "https:"');
    expect(main).toContain('return { action: "deny" }');
  });
});
