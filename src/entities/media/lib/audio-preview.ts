export { MAX_WAVEFORM_DECODE_BYTES } from "../../../../electron/media/types";
import { MAX_WAVEFORM_DECODE_BYTES } from "../../../../electron/media/types";

export const MAX_WAVEFORM_DURATION_SECONDS = 10 * 60;

export function shouldDecodeWaveform(sizeBytes: number, durationSeconds: number): boolean {
  return Number.isFinite(sizeBytes) && sizeBytes > 0
    && sizeBytes <= MAX_WAVEFORM_DECODE_BYTES
    && Number.isFinite(durationSeconds) && durationSeconds > 0
    && durationSeconds <= MAX_WAVEFORM_DURATION_SECONDS;
}
