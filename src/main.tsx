import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/workbench.css";
import "./styles/settings.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
