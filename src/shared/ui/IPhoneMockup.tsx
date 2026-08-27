import { BatteryFull, Signal, Wifi } from "lucide-react";
import type { ReactNode } from "react";

// Adapted from 21st.dev/lovesickfromthe6ix/iphone-mockup for Ralphy's fixed stage geometry.
// Illustration, not app chrome: the shell, the side buttons and the screen carry the device's
// own geometry and its own two tones. The 1px bezel line is gone -- it resolved to the same
// value as the shell it stood on, so it never drew anything.
export function IPhoneMockup({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`iphone-mockup relative aspect-iphone h-full max-h-iphone-height w-auto max-w-iphone rounded-iphone bg-device-body p-2${className ? ` ${className}` : ""}`} aria-label="iPhone preview">
    <span className="iphone-mockup-side is-left absolute -left-0.75 top-28 h-14.5 w-0.75 rounded-device-edge bg-device-edge" aria-hidden="true" />
    <span className="iphone-mockup-side is-right absolute -right-0.75 top-35 h-20.5 w-0.75 rounded-device-edge bg-device-edge" aria-hidden="true" />
    <div className="iphone-mockup-screen relative size-full overflow-hidden rounded-iphone-screen bg-frame">
      <div className="iphone-status-bar absolute inset-x-5 top-3 z-7 flex items-center justify-between font-code type-meta text-on-instrument [&_svg]:size-2.75" aria-hidden="true"><span>9:41</span><span className="flex gap-1"><Signal /><Wifi /><BatteryFull /></span></div>
      <span className="iphone-dynamic-island absolute left-1/2 top-2.5 z-sticky h-6 w-22 -translate-x-1/2 rounded-control bg-frame" aria-hidden="true" />
      <div className="iphone-mockup-content absolute inset-0 z-1 overflow-hidden">{children}</div>
      <span className="iphone-home-indicator absolute bottom-2 left-1/2 z-sticky h-1 w-26 -translate-x-1/2 rounded-control bg-on-instrument/85" aria-hidden="true" />
    </div>
  </div>;
}
