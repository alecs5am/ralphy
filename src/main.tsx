import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ThemeProvider } from "./instrument/ThemeProvider";
import { readWorkbenchPreferences } from "./state/workbench";
import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/instrument.css";
import "./styles/frame.css";
import "./styles/resize-grabber.css";
import "./styles/shared-library.css";
import "./styles/marketplace.css";
import "./styles/work-surfaces.css";
import "./styles/tailwind.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider initialPreference={readWorkbenchPreferences(localStorage).theme}>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
