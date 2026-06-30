import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { PlayerProvider } from "./components/ui/player";
// Self-hosted variable fonts (no CDN). Single modern-grotesque system:
// Mona Sans (display, incl. expanded width axis) + Hanken Grotesk (body) +
// JetBrains Mono (catalog metadata). See docs/design/SPEC.md §2.
import "@fontsource-variable/mona-sans/standard.css";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/global.css";
import "./components/ui/ui.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PlayerProvider>
        <App />
      </PlayerProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
