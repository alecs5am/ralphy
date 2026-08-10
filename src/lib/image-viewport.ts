export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface ImageTransform extends Point { scale: number }

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function scaleFromWheel(currentScale: number, deltaY: number): number {
  return clamp(currentScale * Math.exp(-deltaY * 0.0015), MIN_SCALE, MAX_SCALE);
}

export function zoomAroundPoint(transform: ImageTransform, point: Point, nextScale: number): ImageTransform {
  const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
  const ratio = scale / transform.scale;
  return { scale, x: point.x - (point.x - transform.x) * ratio, y: point.y - (point.y - transform.y) * ratio };
}

export function containedImageSize(image: Size, viewport: Size): Size {
  if (image.width <= 0 || image.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

export function clampImageTransform(transform: ImageTransform, containedImage: Size, viewport: Size): ImageTransform {
  const scale = clamp(transform.scale, MIN_SCALE, MAX_SCALE);
  const maxX = Math.max(0, (containedImage.width * scale - viewport.width) / 2);
  const maxY = Math.max(0, (containedImage.height * scale - viewport.height) / 2);
  return { scale, x: maxX === 0 ? 0 : clamp(transform.x, -maxX, maxX), y: maxY === 0 ? 0 : clamp(transform.y, -maxY, maxY) };
}
