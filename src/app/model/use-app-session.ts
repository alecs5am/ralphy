/**
 * The app's session: which store is open, what it holds, and the paced welcome in front of it.
 *
 * Restoration is the first thing the app does and the one thing every screen waits on, so the
 * root identity, the catalog, the route history and the error the operator sees all belong to one
 * unit rather than to seven pieces of component state. The welcome is part of it: it is what the
 * restore looks like, and it leaves on a floor of its own so a fast store does not flash it.
 *
 * The theme's two side effects live here too. The renderer paints from the preference, and the
 * window has to be told separately -- macOS draws the traffic lights and the native scrollbars
 * from the window's appearance, not from what we paint.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import {
  bridge,
  type MigrationRecovery,
  type RootIdentity,
} from "@/shared/api/ipc";
import type { ThemePreference } from "@/shared/instrument/types";
import {
  createInitialWorkbenchState,
  mostRecentWorkspaceId,
  readWorkbenchPreferences,
  updateWorkbenchPreferences,
  workbenchReducer,
} from "@/shared/model/workbench";

import { applyActivityRefresh } from "./app-visibility";
import { loadProjectScreen } from "../ui/WorkRoute";

/* The welcome holds for a beat even when the store opens at once: a flash of a splash reads as a
   glitch, and the exit is a transition rather than a swap. */
const WELCOME_MINIMUM_MS = 1_200;
const WELCOME_EXIT_MS = 300;

export function useAppSession(theme: ThemePreference) {
  const initialPreferences = useRef(readWorkbenchPreferences(localStorage));
  const [state, dispatch] = useReducer(
    workbenchReducer,
    initialPreferences.current,
    createInitialWorkbenchState,
  );
  const [restoring, setRestoring] = useState(true);
  const [rootIdentity, setRootIdentity] = useState<RootIdentity | null>(null);
  const [migrationRecovery, setMigrationRecovery] = useState<MigrationRecovery | null>(null);
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [welcomeExiting, setWelcomeExiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const restorationStarted = useRef(false);
  const welcomeStartedAt = useRef(Date.now());
  const restoreHomeLibrary = useCallback(async () => {
    setRestoring(true);
    setError(null);
    try {
      const result = await bridge.restoreLibrary();
      if (!result) return;
      setRootIdentity(result.identity);
      const saved = initialPreferences.current;
      const savedWorkspace =
        saved.rootPath === result.identity.storeId &&
        saved.workspaceId &&
        result.catalog.workspaces.some(
          (workspace) => workspace.id === saved.workspaceId,
        )
          ? saved.workspaceId
          : null;
      const workspaceId =
        savedWorkspace ?? mostRecentWorkspaceId(result.catalog.workspaces);
      dispatch({ type: "library-opened", catalog: result.catalog, workspaceId });
      if (
        workspaceId &&
        saved.rootPath === result.identity.storeId &&
        saved.projectId &&
        result.catalog.projects.some(
          (project) =>
            project.workspaceId === workspaceId &&
            project.projectId === saved.projectId,
        )
      ) {
        dispatch({
          type: "open-project",
          project: { workspaceId, projectId: saved.projectId },
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRestoring(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = bridge.onMediaEvent((event) => {
      if (event.type === "root-ready") {
        setRootIdentity(event.identity);
        setMigrationRecovery(null);
      } else if (event.type === "activity-refresh") {
        setRootIdentity((identity) => applyActivityRefresh(identity, event));
      } else if (event.type === "migration-recovery") {
        setMigrationRecovery(event.recovery);
      } else if (event.type === "catalog-result") {
        dispatch({ type: "catalog-received", catalog: event.result });
      } else if (event.type === "error") {
        setError(event.message);
      }
    });

    if (!restorationStarted.current) {
      restorationStarted.current = true;
      void restoreHomeLibrary();
    }

    return unsubscribe;
  }, [restoreHomeLibrary]);

  useEffect(() => {
    if (restoring || !welcomeVisible) return;
    let exitTimer = 0;
    const remaining = Math.max(
      0,
      WELCOME_MINIMUM_MS - (Date.now() - welcomeStartedAt.current),
    );
    const revealTimer = window.setTimeout(() => {
      setWelcomeExiting(true);
      exitTimer = window.setTimeout(
        () => setWelcomeVisible(false),
        WELCOME_EXIT_MS,
      );
    }, remaining);
    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(exitTimer);
    };
  }, [restoring, welcomeVisible]);

  useEffect(() => {
    if (state.route.kind !== "workspace") return;
    const timer = window.setTimeout(() => void loadProjectScreen(), 700);
    return () => window.clearTimeout(timer);
  }, [state.route.kind]);

  useEffect(() => {
    const measure = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (restoring) return;
    const timer = window.setTimeout(() => {
      updateWorkbenchPreferences(localStorage, (current) => ({
        ...current,
        theme,
      }));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [restoring, theme]);

  /* The window's native chrome takes the same preference, unresolved: `themeSource` reads "system"
     the way we do. macOS draws the traffic lights, native menus and scrollbars from the window's
     appearance rather than from what the renderer paints, so a dark app in a light-appearance
     window gets its inactive traffic lights greyed for a surface that is not there -- which is why
     they read as missing rather than as the grey dots every other app shows. */
  useEffect(() => {
    void bridge.applyNativeAppearance(theme).catch(() => undefined);
  }, [theme]);


  return {
    initialPreferences,
    state,
    dispatch,
    restoring,
    rootIdentity,
    migrationRecovery,
    error,
    setError,
    welcomeVisible,
    welcomeExiting,
    viewport,
    restoreHomeLibrary,
  };
}
