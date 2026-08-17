import { Check, LoaderCircle } from "lucide-react";
import { motion } from "motion/react";
import { RalphyMascot } from "./RalphyMascot";

export function WelcomeScreen({
  exiting,
  restoring,
}: {
  exiting: boolean;
  restoring: boolean;
}) {
  const steps = [".ralphy library", "Workspace index", "Media workbench"];
  return (
    <div className={`welcome-screen${exiting ? " is-exiting" : ""}`}>
      <motion.div
        className="welcome-mascot"
        initial={{ opacity: 0, y: 10, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.38, ease: [0.2, 0, 0.2, 1] }}
      >
        <RalphyMascot size={104} />
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.28 }}
      >
        Howdy, partner!
      </motion.h1>
      <div className="welcome-statuses" aria-live="polite">
        {steps.map((step, index) => {
          const active = restoring && index === 0;
          const complete = !restoring;
          return (
            <motion.div
              className={complete ? "is-complete" : active ? "is-active" : ""}
              key={step}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 + index * 0.07, duration: 0.2 }}
            >
              {complete ? <Check size={13} /> : <LoaderCircle size={13} />}
              <span>{step}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
