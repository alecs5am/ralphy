import { Check, LoaderCircle } from "lucide-react";
import { RalphyMascot } from "@/shared/ui/RalphyMascot";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "@/shared/instrument/screen-state-registry";

export const welcomeInstrumentStates = defineInstrumentScreenStates({
  routeKey: "startup.welcome",
  states: ["restoring", "ready"],
  rootMarker: "startup-welcome",
  landmarks: ["Howdy, partner!", "Workspace index"],
} as const);

const STEPS = [".ralphy library", "Workspace index", "Media workbench"];

/* One status row. Only the ink changes between the three states, so the plate under them never
   moves. `is-complete` and `is-active` stay as class hooks. Every animated element carries its own
   reduced-motion reset: an `!important` blanket in an unlayered sheet loses to an `!important`
   utility inside @layer utilities, so the sheet's blanket cannot reach these.
   A pending step used to paint `--instrument-text-muted-decorative`, which is #9A9A96 on the
   #F1F2F6 plate -- 2.4:1, and the token block says outright that the muted inks are unreadable
   as copy. A step that has not run yet is still a sentence, so it takes the readable ink and the
   spinner is what says "in progress". */
const STATUS_ROW = "grid h-8.5 grid-cols-(--welcome-status-columns) items-center gap-2.5 rounded-control px-3 font-code type-mono-sm tracking-eyebrow uppercase animate-welcome-rise motion-reduce:animate-none";

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
    <div className={`welcome-screen relative grid size-full place-content-center justify-items-center gap-4.5 overflow-hidden bg-desk transition duration-slow ease-instrument motion-reduce:transition-none motion-reduce:duration-0${exiting ? " is-exiting opacity-0 [transform:scale(1.015)]" : ""}`}>
      <div className="welcome-mascot grid size-welcome-mascot place-items-center rounded-panel bg-instrument animate-welcome-rise motion-reduce:animate-none">
        <RalphyMascot size={104} />
      </div>
      <h1 className="m-0 type-display font-normal tracking-page text-ink animate-welcome-rise motion-reduce:animate-none">Howdy, partner!</h1>
      <div className="welcome-statuses grid w-welcome-panel gap-0.5 rounded-panel bg-surface p-2" aria-live="polite">
        {STEPS.map((step, index) => {
          const active = restoring && index === 0;
          const complete = !restoring;
          return (
            <div
              className={`${STATUS_ROW} ${complete ? "is-complete text-ink" : `text-muted${active ? " is-active" : ""}`}`}
              style={{ animationDelay: `${80 + index * 60}ms` }}
              key={step}
            >
              {complete ? <Check size={13} /> : <LoaderCircle className={active ? "animate-welcome-spin motion-reduce:animate-none" : undefined} size={13} />}
              <span className="min-w-0 truncate">{step}</span>
            </div>
          );
        })}
      </div>
    </div>
    </InstrumentScreenRoot>
  );
}
