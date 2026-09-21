import { effectAmount, effectPixelSize, type VisualEffectId } from "./effect-settings";
import { INSTRUMENT_PALETTE } from "@/shared/instrument/palette";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Ordered dithering reduces the real image palette, retaining its alpha channel. */
export function ditherPixels(data: Uint8ClampedArray, width: number, amount: number) {
  const strength = effectAmount(amount) / 100;
  if (!strength) return;
  const levels = Math.max(2, Math.round(8 - strength * 6));
  const step = 255 / (levels - 1);
  for (let pixel = 0; pixel < data.length / 4; pixel++) {
    const threshold = (BAYER[((Math.floor(pixel / width) % 4) * 4) + (pixel % width % 4)]! / 16 - 0.5) * step;
    for (let channel = 0; channel < 3; channel++) data[pixel * 4 + channel] = Math.round((data[pixel * 4 + channel]! + threshold) / step) * step;
  }
}

/** Native canvas processing of the same frame shown on the original side. */
export function renderEffectFrame(context: CanvasRenderingContext2D, source: HTMLCanvasElement, scratch: HTMLCanvasElement, id: VisualEffectId, amount: number, frame: number) {
  const strength = effectAmount(amount) / 100;
  const { width, height } = source;
  context.clearRect(0, 0, width, height);
  context.save();
  context.filter = id === "noir-grade" ? `grayscale(${strength}) contrast(${1 + strength * 0.9}) brightness(${1 - strength * 0.15})`
    : id === "vhs-overlay" ? `saturate(${1 - strength * 0.35}) contrast(${1 + strength * 0.2})`
      : id === "film-grain" ? `contrast(${1 + strength * 0.12}) saturate(${1 - strength * 0.2})`
        : "none";
  context.drawImage(source, 0, 0);
  context.restore();
  if (!strength) return;

  if (id === "voxel-dither") {
    const size = Math.max(1, Math.round(effectPixelSize(amount) * width / 640));
    scratch.width = Math.ceil(width / size);
    scratch.height = Math.ceil(height / size);
    const small = scratch.getContext("2d");
    if (!small) return;
    small.drawImage(source, 0, 0, scratch.width, scratch.height);
    const pixels = small.getImageData(0, 0, scratch.width, scratch.height);
    ditherPixels(pixels.data, scratch.width, amount);
    small.putImageData(pixels, 0, 0);
    context.imageSmoothingEnabled = false;
    context.drawImage(scratch, 0, 0, width, height);
    context.imageSmoothingEnabled = true;
  } else if (id === "chroma-split") {
    const original = context.getImageData(0, 0, width, height);
    const changed = context.createImageData(width, height);
    const offset = Math.max(1, Math.round(width * strength * 0.035));
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      changed.data[index] = original.data[(y * width + Math.max(0, x - offset)) * 4]!;
      changed.data[index + 1] = original.data[index + 1]!;
      changed.data[index + 2] = original.data[(y * width + Math.min(width - 1, x + offset)) * 4 + 2]!;
      changed.data[index + 3] = original.data[index + 3]!;
    }
    context.putImageData(changed, 0, 0);
  } else if (id === "film-grain") {
    const pixels = context.getImageData(0, 0, width, height);
    let seed = (frame + 1) * 1237;
    for (let index = 0; index < pixels.data.length; index += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = ((seed / 0xffffffff) - 0.5) * 85 * strength;
      for (let channel = 0; channel < 3; channel++) pixels.data[index + channel] += noise;
    }
    context.putImageData(pixels, 0, 0);
  } else if (id === "crt-scanlines") {
    context.fillStyle = INSTRUMENT_PALETTE.dark.mediaFrame;
    context.globalAlpha = strength * 0.7;
    for (let y = 0; y < height; y += 4) context.fillRect(0, y, width, 2);
    context.fillStyle = INSTRUMENT_PALETTE.dark.identity1Highlight;
    context.globalAlpha = strength * 0.12;
    context.fillRect(0, ((frame * 3) % (height + 24)) - 24, width, 24);
    context.globalAlpha = 1;
  } else if (id === "vhs-overlay") {
    const band = (frame * 7) % height;
    const shift = Math.sin(frame * 1.7) * width * strength * 0.025;
    context.globalAlpha = strength * 0.8;
    context.drawImage(source, 0, band, width, Math.min(12, height - band), shift, band, width, Math.min(12, height - band));
    context.fillStyle = INSTRUMENT_PALETTE.dark.textOnDarkPrimary;
    context.globalAlpha = strength * 0.08;
    for (let y = 0; y < height; y += 3) context.fillRect(0, y, width, 1);
    context.globalAlpha = 1;
  }
}
