import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyStoredTheme } from "./theme/boot";
import "./styles.css";

applyStoredTheme();

const container = document.getElementById("root");
if (container === null) {
  throw new Error("#root element not found in index.html");
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
