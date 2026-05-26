import { useEffect, useState } from "react";
import { bridge, type AuthState } from "./lib/ipc";
import { Onboarding } from "./screens/Onboarding";
import { Workspace } from "./screens/Workspace";

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);

  useEffect(() => {
    bridge.getAuthState().then(setAuth);
  }, []);

  if (!auth) return null;

  if (!auth.method) {
    return <Onboarding auth={auth} onPicked={() => bridge.getAuthState().then(setAuth)} />;
  }

  return <Workspace />;
}
