import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ThemeProvider } from "./providers/ThemeProvider";
import { readWorkbenchPreferences } from "@/shared/model/workbench";
import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/instrument.css";
import "./styles/frame.css";
import "./styles/keycap.css";
import "./styles/agent-mark.css";
import "./styles/resize-grabber.css";
import "./styles/shared-library.css";
import "./styles/marketplace.css";
import "./styles/work-surfaces.css";
import "./styles/tailwind.css";

/* A file dropped anywhere but a real target must do nothing. The default is to *navigate* to it,
   which in a single-page app means the window becomes the file -- an image filling the whole
   window with nothing to do, which is exactly what a stray drop on the chat used to produce. The
   composer's own handler runs first and takes what it wants; this is the floor under it. */
for (const type of ["dragover", "drop"] as const) {
  window.addEventListener(type, (event) => event.preventDefault());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider initialPreference={readWorkbenchPreferences(localStorage).theme}>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
