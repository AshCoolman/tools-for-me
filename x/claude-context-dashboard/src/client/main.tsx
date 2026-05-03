import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { FeaturesProvider } from "./Features.js";
import { SettingsProvider } from "./Settings.js";

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root not found in index.html");
}

createRoot(container).render(
  <React.StrictMode>
    <SettingsProvider>
      <FeaturesProvider>
        <App />
      </FeaturesProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
