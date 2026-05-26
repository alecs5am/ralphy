import { contextBridge, ipcRenderer } from "electron";

/**
 * Exposes window.ralphy to the renderer. Mirrors RalphyBridge in src/lib/ipc.ts.
 * The renderer falls back to a mock when this is absent (plain browser dev).
 */
contextBridge.exposeInMainWorld("ralphy", {
  getAuthState: () => ipcRenderer.invoke("auth:get"),
  setAuthMethod: (method: string) => ipcRenderer.invoke("auth:set", method),
  send: (prompt: string) => ipcRenderer.invoke("agent:send", prompt),
  onEvent: (cb: (e: unknown) => void) => {
    const h = (_: unknown, e: unknown) => cb(e);
    ipcRenderer.on("agent:event", h);
    return () => ipcRenderer.removeListener("agent:event", h);
  },
  onPermission: (cb: (r: unknown) => void) => {
    const h = (_: unknown, r: unknown) => cb(r);
    ipcRenderer.on("agent:permission", h);
    return () => ipcRenderer.removeListener("agent:permission", h);
  },
  resolvePermission: (id: string, allow: boolean) => ipcRenderer.invoke("agent:permission:resolve", { id, allow }),
});
