import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { clampImageTransform, containedImageSize, scaleFromWheel, zoomAroundPoint, type ImageTransform, type Size } from "../../lib/image-viewport";

interface ImageViewportProps { src: string; name: string; compact?: boolean }
const RESET: ImageTransform = { scale: 1, x: 0, y: 0 };

export function ImageViewport({ src, name, compact = false }: ImageViewportProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<Size>({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState<Size>({ width: 0, height: 0 });
  const [panning, setPanning] = useState(false);
  const [transform, setTransform] = useState<ImageTransform>(RESET);
  const fittedSize = containedImageSize(naturalSize, viewportSize);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => setViewportSize({ width: root.clientWidth, height: root.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (fittedSize.width === 0 || fittedSize.height === 0) return;
    setTransform((current) => clampImageTransform(current, fittedSize, viewportSize));
  }, [fittedSize.height, fittedSize.width, viewportSize.height, viewportSize.width]);

  const geometry = () => {
    const root = rootRef.current;
    if (!root) return null;
    const bounds = root.getBoundingClientRect();
    const viewport = { width: root.clientWidth, height: root.clientHeight };
    return { bounds, viewport, image: containedImageSize(naturalSize, viewport) };
  };
  const setScale = (scale: number, point = { x: 0, y: 0 }) => {
    const sizes = geometry();
    if (!sizes) return;
    setTransform((current) => clampImageTransform(zoomAroundPoint(current, point, scale), sizes.image, sizes.viewport));
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (compact) return;
    event.preventDefault();
    const sizes = geometry();
    if (!sizes) return;
    const point = { x: event.clientX - sizes.bounds.left - sizes.bounds.width / 2, y: event.clientY - sizes.bounds.top - sizes.bounds.height / 2 };
    setTransform((current) => clampImageTransform(zoomAroundPoint(current, point, scaleFromWheel(current.scale, event.deltaY)), sizes.image, sizes.viewport));
  };
  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div className={`image-viewport${compact ? " is-compact" : ""}${panning ? " is-panning" : ""}`} ref={rootRef} onWheel={onWheel}
      onPointerDown={(event) => {
        if (compact || event.button !== 0 || (event.target as Element).closest("button")) return;
        event.preventDefault();
        drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: transform.x, originY: transform.y };
        setPanning(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        const sizes = geometry();
        if (!current || !sizes || current.pointerId !== event.pointerId) return;
        setTransform((previous) => clampImageTransform({ scale: previous.scale, x: current.originX + event.clientX - current.x, y: current.originY + event.clientY - current.y }, sizes.image, sizes.viewport));
      }} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
      <img className="viewer-image" src={src} alt={name} draggable={false}
        style={{ width: fittedSize.width || undefined, height: fittedSize.height || undefined, transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})` }}
        onLoad={(event) => { setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setTransform(RESET); }} />
      {!compact && <div className="image-zoom-controls">
        <button type="button" aria-label="Zoom out" title="Zoom out" disabled={transform.scale <= 1} onClick={() => setScale(transform.scale / 1.35)}><ZoomOut size={15} /></button>
        <span>{Math.round(transform.scale * 100)}%</span>
        <button type="button" aria-label="Zoom in" title="Zoom in" disabled={transform.scale >= 8} onClick={() => setScale(transform.scale * 1.35)}><ZoomIn size={15} /></button>
        <button type="button" aria-label="Fit image" title="Fit image" disabled={transform.scale === 1 && transform.x === 0 && transform.y === 0} onClick={() => setTransform(RESET)}><RotateCcw size={14} /></button>
      </div>}
    </div>
  );
}
