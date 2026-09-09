import { readFile } from "node:fs/promises";
import type { BridgeMethod, ParamsFor, ResultFor } from "../ralphy/types";
import type { CanvasRunResult } from "../../shared/canvas-runtime";
import { canvasAssetMime, validateCanvasAsset } from "./runtime-files";

export type CanvasRequest = <Method extends BridgeMethod>(method: Method, params: ParamsFor<Method>) => Promise<ResultFor<Method>>;
export type CanvasPreview = (path: string, mime: string | null, bytes: number) => Promise<{ url: string }>;

export async function hydrateCanvasResult(root: string, workspaceId: string, result: CanvasRunResult, _request: CanvasRequest, mint: CanvasPreview): Promise<CanvasRunResult> {
  if (!result.asset) return { ...result, previewUrl: undefined };
  try {
    const checked = await validateCanvasAsset(root, result.asset, workspaceId);
    const mime = canvasAssetMime(checked.path);
    if (!mime) return { ...result, previewUrl: undefined };
    const preview = await mint(checked.path, mime, checked.bytes);
    const text = result.kind === "text" && checked.bytes <= 100_000 ? (await readFile(checked.path, "utf8")).slice(0, 20_000) : result.text;
    return { ...result, ...(text ? { text } : {}), previewUrl: preview.url };
  } catch { return { ...result, previewUrl: undefined }; }
}
