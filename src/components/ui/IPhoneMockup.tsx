import { BatteryFull, Signal, Wifi } from "lucide-react";
import type { ReactNode } from "react";

// Adapted from 21st.dev/lovesickfromthe6ix/iphone-mockup for Ralphy's fixed stage geometry.
export function IPhoneMockup({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`iphone-mockup${className ? ` ${className}` : ""}`} aria-label="iPhone preview">
    <span className="iphone-mockup-side is-left" aria-hidden="true" />
    <span className="iphone-mockup-side is-right" aria-hidden="true" />
    <div className="iphone-mockup-screen">
      <div className="iphone-status-bar" aria-hidden="true"><span>9:41</span><span><Signal /><Wifi /><BatteryFull /></span></div>
      <span className="iphone-dynamic-island" aria-hidden="true" />
      <div className="iphone-mockup-content">{children}</div>
      <span className="iphone-home-indicator" aria-hidden="true" />
    </div>
  </div>;
}
