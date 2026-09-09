import { act } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { SettingsScreen } from "@/pages/settings";
import { bridge } from "@/shared/api/ipc";
import { GENERATION_PROVIDERS_CHANGED_EVENT, type GenerationProviderStatus } from "../shared/generation-studio";
import { createReactHost, type HostNode } from "./react-host";

const initial: GenerationProviderStatus[] = [
  { id: "openrouter", name: "OpenRouter", capabilities: ["image", "video", "text"], configured: false, stored: false, inherited: false },
  { id: "elevenlabs", name: "ElevenLabs", capabilities: ["voice", "music", "sfx"], configured: true, stored: true, inherited: true },
  { id: "fal", name: "fal.ai", capabilities: ["video"], configured: true, stored: false, inherited: true },
];
afterEach(() => vi.restoreAllMocks());
function button(root: HostNode, name: string) {
  const match = root.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === name || node.textContent === name);
  if (!match) throw new Error(`Missing button: ${name}`);
  return match;
}
const click = async (root: HostNode, name: string) => { await act(async () => button(root, name).dispatchEvent(new Event("click", { bubbles: true }))); };
const password = (root: HostNode, provider: string) => root.querySelector(`#provider-key-${provider}`) as unknown as HTMLInputElement;
async function enter(root: HostNode, provider: string, value: string) {
  const input = password(root, provider);
  // This DOM-only host uses React's legacy change-event path.
  Object.assign(input, { attachEvent() {}, detachEvent() {} });
  await act(async () => {
    input.dispatchEvent(new Event("focusin", { bubbles: true }));
    input.value = value;
    input.dispatchEvent(new Event("keyup", { bubbles: true }));
    input.dispatchEvent(new Event("focusout", { bubbles: true }));
  });
}
const submit = async (root: HostNode) => { await act(async () => root.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); };

async function mount(loadError = false) {
  let statuses = structuredClone(initial);
  const load = vi.spyOn(bridge, "loadGenerationProviders").mockImplementation(async () => structuredClone(statuses));
  if (loadError) load.mockRejectedValueOnce(new Error("Encrypted credential store is unavailable"));
  const save = vi.spyOn(bridge, "setGenerationProviderKey").mockImplementation(async (id) => {
    statuses = statuses.map((item) => item.id === id ? { ...item, stored: true, configured: true } : item);
    return structuredClone(statuses);
  });
  const clear = vi.spyOn(bridge, "clearGenerationProviderKey").mockImplementation(async (id) => {
    statuses = statuses.map((item) => item.id === id ? { ...item, stored: false, configured: item.inherited } : item);
    return structuredClone(statuses);
  });
  vi.spyOn(bridge, "getAgentProviders").mockResolvedValue([]);
  const host = createReactHost();
  const changed = vi.fn();
  window.addEventListener(GENERATION_PROVIDERS_CHANGED_EVENT, changed);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  await act(async () => root.render(<SettingsScreen rootPath="/workspace" theme="system" entryPage="providers" onThemeChange={() => undefined} onBack={() => undefined} />));
  return { host, root, load, save, clear, changed, async close() { await act(async () => root.unmount()); window.removeEventListener(GENERATION_PROVIDERS_CHANGED_EVENT, changed); host.restore(); } };
}

test("shows real key presence, saves blank-entry credentials, and removes only app-stored keys", async () => {
  const mounted = await mount();
  const { host, save, clear, changed } = mounted;
  try {
    for (const provider of ["OpenRouter", "ElevenLabs", "fal.ai"]) expect(button(host.container, `Manage ${provider}`)).toBeTruthy();
    for (const absent of ["Replicate", "HeyGen", "NOT CONFIGURED HERE", "Keychain"]) expect(host.container.textContent).not.toContain(absent);
    const rail = host.container.querySelectorAll("aside").find((node) => node.getAttribute("aria-label") === "Page context")!;
    expect(rail.textContent).toContain("Services3");
    expect(rail.textContent).toContain("Keys present2");
    expect(rail.textContent).toContain("Saved on this Mac1");
    await click(host.container, "Manage OpenRouter");
    expect(password(host.container, "openrouter").type).toBe("password");
    expect(password(host.container, "openrouter").value).toBe("");
    expect(button(host.container, "Save key").disabled).toBe(true);
    await enter(host.container, "openrouter", "test-entered-credential");
    await submit(host.container);
    expect(save).toHaveBeenCalledWith("openrouter", "test-entered-credential");
    expect(password(host.container, "openrouter").value).toBe("");
    expect(host.container.textContent).toContain("Provider access has not been tested.");
    expect(host.container.textContent).not.toContain("test-entered-credential");
    expect(changed).toHaveBeenCalledOnce();
    expect(button(host.container, "Replace key").disabled).toBe(true);
    await enter(host.container, "openrouter", "test-replacement-credential");
    await submit(host.container);
    expect(save).toHaveBeenLastCalledWith("openrouter", "test-replacement-credential");
    expect(password(host.container, "openrouter").value).toBe("");
    await enter(host.container, "openrouter", "unsaved-replacement");
    await click(host.container, "Back to the category");
    await click(host.container, "Manage ElevenLabs");
    expect(password(host.container, "elevenlabs").value).toBe("");
    await click(host.container, "Disconnect saved key");
    expect(clear).toHaveBeenCalledWith("elevenlabs");
    expect(host.container.textContent).toContain("An environment key remains available.");
    expect(host.container.textContent).toContain("Key present");
    expect(button(host.container, "Disconnect saved key").disabled).toBe(true);
    expect(changed).toHaveBeenCalledTimes(3);
    await click(host.container, "Back to the category");
    await click(host.container, "Manage fal.ai");
    expect(button(host.container, "Disconnect saved key").disabled).toBe(true);
    expect(host.container.textContent).toContain("FROM ENVIRONMENT");
  } finally { await mounted.close(); }
});

test("retries native status failures and redacts rejected key errors without claiming success", async () => {
  const mounted = await mount(true);
  const { host, load, save, changed } = mounted;
  try {
    expect(host.container.querySelector("[role='alert']")?.textContent).toContain("Encrypted credential store is unavailable");
    await click(host.container, "Manage OpenRouter");
    expect(password(host.container, "openrouter").disabled).toBe(true);
    await click(host.container, "Refresh status");
    expect(load).toHaveBeenCalledTimes(2);
    expect(password(host.container, "openrouter").disabled).toBe(false);
    save.mockRejectedValueOnce(new Error("Cannot store sensitive-test-key on this Mac"));
    await enter(host.container, "openrouter", "sensitive-test-key");
    await submit(host.container);
    expect(host.container.querySelector("[role='alert']")?.textContent).toBe("Cannot store [redacted] on this Mac");
    expect(host.container.textContent).not.toContain("sensitive-test-key");
    expect(host.container.textContent).toContain("No key configured");
    expect(changed).not.toHaveBeenCalled();
    await submit(host.container);
    expect(save).toHaveBeenCalledTimes(2);
    expect(password(host.container, "openrouter").value).toBe("");
    expect(host.container.querySelector("[role='alert']")).toBeNull();
    expect(changed).toHaveBeenCalledOnce();
  } finally { await mounted.close(); }
});
