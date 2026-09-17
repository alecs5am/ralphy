import type { BridgeMethod, ParamsFor, ResultFor } from "../ralphy/types";
import type { CanvasRunResult } from "../../shared/canvas-runtime";
import { canvasAssetMime, readCanvasText, validateCanvasAsset } from "./runtime-files";

export type CanvasRequest = <Method extends BridgeMethod>(method: Method, params: ParamsFor<Method>) => Promise<ResultFor<Method>>;
export type CanvasPreview = (path: string, mime: string | null, bytes: number) => Promise<{ url: string }>;

export async function hydrateCanvasResult(root: string, workspaceId: string, result: CanvasRunResult, _request: CanvasRequest, mint: CanvasPreview): Promise<CanvasRunResult> {
  if (!result.asset) return { ...result, previewUrl: undefined };
  try {
    const checked = await validateCanvasAsset(root, result.asset, workspaceId);
    if (result.kind === "text") return { ...result, text: (await readCanvasText(root, workspaceId, result.asset)).slice(0, 20_000), previewUrl: undefined, unavailableReason: undefined };
    const mime = canvasAssetMime(checked.path);
    if (!mime) return { ...result, previewUrl: undefined };
    const preview = await mint(checked.path, mime, checked.bytes);
    return { ...result, previewUrl: preview.url, unavailableReason: undefined };
  } catch (cause) { return { ...result, previewUrl: undefined, unavailableReason: (cause as NodeJS.ErrnoException).code === "ENOENT" ? "This result's file is missing. Restore it from a workspace backup or choose another result." : "This result's file cannot be opened. Restore it from a workspace backup or choose another result." }; }
}
