import { openComposition, ORIGIN_LOCAL, type Composition } from "@hyperframes/sdk";
import { compositionInfo } from "./composition";

const ATTRIBUTE = "data-ralphy-fps";
export const validFrameRate = (fps: number) => [24, 25, 30, 60].includes(fps);
export function frameRate(comp: Composition, fallback: number): number {
  const value = Number(compositionInfo(comp).root?.attributes[ATTRIBUTE]);
  return validFrameRate(value) ? value : fallback;
}
export function setFrameRate(comp: Composition, fps: number, origin?: string): void {
  const root = compositionInfo(comp).root;
  if (!validFrameRate(fps) || !root) throw new Error("Choose a supported frame rate");
  comp.dispatch({ type: "setAttribute", target: root.scopedId, name: ATTRIBUTE, value: String(fps) }, { origin });
}
export async function openVideoComposition(html: string, fps: number): Promise<Composition> {
  const comp = await openComposition(html, { coalesceMs: 350, trackedOrigins: [ORIGIN_LOCAL] });
  // Frame rate participates in the SDK's existing undo history. Initialization does not.
  setFrameRate(comp, fps, "initial-frame-rate");
  return comp;
}
