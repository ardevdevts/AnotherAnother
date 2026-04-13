import React from "react";
import ReactDOM from "react-dom/client";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import App from "./App";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HotkeysProvider>
      <App />
    </HotkeysProvider>
  </React.StrictMode>,
);
