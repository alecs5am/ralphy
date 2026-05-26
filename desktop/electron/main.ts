import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { ClaudeSession, detectClaude, type AgentEvent } from "./claude/session";

// Bundled to dist-electron/main.cjs (CJS), so __dirname is available natively.
// Renderer build lands in dist/. The repo root is two levels up from dist-electron/,
// and pointing the agent's cwd there loads the real AGENTS.md + CLAUDE.md + skills.
const REPO_ROOT = join(__dirname, "..", "..");
const RENDERER = join(__dirname, "..", "dist", "index.html");

let win: BrowserWindow | null = null;
let session: ClaudeSession | null = null;
let authMethod: "subscription" | "api-key" | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 880,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0A0A0B",
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true },
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(RENDERER);
}

function emit(e: AgentEvent) {
  win?.webContents.send("agent:event", e);
}

ipcMain.handle("auth:get", async () => {
  const det = await detectClaude();
  return { method: authMethod, claudeBinaryReady: det.ready, apiKeyInEnv: det.apiKeyInEnv };
});

ipcMain.handle("auth:set", (_e, method: "subscription" | "api-key") => {
  authMethod = method;
});

ipcMain.handle("agent:send", async (_e, prompt: string) => {
  if (!session) {
    session = new ClaudeSession({
      projectDir: REPO_ROOT,
      preferSubscription: authMethod === "subscription",
      onEvent: emit,
    });
  }
  await session.send(prompt);
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { session?.stop(); if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
