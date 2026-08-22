import { Check, LoaderCircle } from "lucide-react";
import { RalphyMascot } from "./RalphyMascot";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "../instrument/screen-state-registry";

export const welcomeInstrumentStates = defineInstrumentScreenStates({
  routeKey: "startup.welcome",
  states: ["restoring", "ready"],
  rootMarker: "startup-welcome",
  landmarks: ["Howdy, partner!", "Workspace index"],
} as const);

const STEPS = [".ralphy library", "Workspace index", "Media workbench"];

// Entrance motion is CSS, not JS: library restore occupies the main thread for the
// whole life of this screen, so a requestAnimationFrame-driven animation never
// starts and the screen would stay at its initial opacity.
export function WelcomeScreen({
  exiting,
  restoring,
}: {
  exiting: boolean;
  restoring: boolean;
}) {
  return (
    <InstrumentScreenRoot descriptor={welcomeInstrumentStates} state={restoring ? "restoring" : "ready"}>
    <div className={`welcome-screen${exiting ? " is-exiting" : ""}`}>
      <div className="welcome-mascot">
        <RalphyMascot size={104} />
      </div>
      <h1>Howdy, partner!</h1>
      <div className="welcome-statuses" aria-live="polite">
        {STEPS.map((step, index) => {
          const active = restoring && index === 0;
          const complete = !restoring;
          return (
            <div
              className={complete ? "is-complete" : active ? "is-active" : ""}
              style={{ animationDelay: `${80 + index * 60}ms` }}
              key={step}
            >
              {complete ? <Check size={13} /> : <LoaderCircle size={13} />}
              <span>{step}</span>
            </div>
          );
        })}
      </div>
    </div>
    </InstrumentScreenRoot>
  );
}
