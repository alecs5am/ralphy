/* The decode ceiling the main process enforces, re-exported for the renderer. The renderer's own
   gate lives in `shared/lib/audio-peaks`, which reads the same number: a file over the ceiling
   draws a flat seek line rather than its peaks, and no second decision is taken here. */
export { MAX_WAVEFORM_DECODE_BYTES } from "../../../../electron/media/types";
