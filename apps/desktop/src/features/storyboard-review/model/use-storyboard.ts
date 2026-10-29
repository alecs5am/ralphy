import { useCallback, useEffect, useRef, useState } from "react";
import { bridge, type ProjectReference } from "@/shared/api/ipc";
import type { DesktopStoryboardReviewInput, StoryboardDto } from "../../../../electron/ralphy/storyboard-types";

export type StoryboardState =
  | { status: "loading"; storyboard: null; error: null }
  | { status: "ready"; storyboard: StoryboardDto; error: string | null }
  | { status: "error"; storyboard: null; error: string };

export interface StoryboardController {
  state: StoryboardState;
  saving: boolean;
  reload(): void;
  decide(input: DesktopStoryboardReviewInput): Promise<boolean>;
}

const message = (cause: unknown, fallback: string) => cause instanceof Error && cause.message ? cause.message : fallback;

/* One project's storyboard, read once per project and replaced by the answer of each decision:
   the runtime returns the storyboard as it stands after the write, so a decision never refetches. */
export function useStoryboard(project: ProjectReference): StoryboardController {
  const [state, setState] = useState<StoryboardState>({ status: "loading", storyboard: null, error: null });
  const [saving, setSaving] = useState(false);
  const scope = `${project.workspaceId}:${project.projectId}`;
  const current = useRef(scope);
  current.current = scope;
  const inFlight = useRef(false);

  const reload = useCallback(() => {
    const requested = scope;
    setState({ status: "loading", storyboard: null, error: null });
    bridge.loadProjectStoryboard(project).then(
      (storyboard) => { if (current.current === requested) setState({ status: "ready", storyboard, error: null }); },
      (cause) => { if (current.current === requested) setState({ status: "error", storyboard: null, error: message(cause, "The storyboard could not be loaded.") }); },
    );
  }, [scope]);

  useEffect(reload, [reload]);

  const decide = async (input: DesktopStoryboardReviewInput): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setSaving(true);
    const requested = scope;
    try {
      const storyboard = await bridge.reviewProjectStoryboard(project, input);
      if (current.current === requested) setState({ status: "ready", storyboard, error: null });
      return true;
    } catch (cause) {
      if (current.current === requested) {
        setState((previous) => previous.status === "ready"
          ? { ...previous, error: message(cause, "The decision could not be saved. Try again.") }
          : previous);
      }
      return false;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return { state, saving, reload, decide };
}
