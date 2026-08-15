/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

// Imported first: it must patch ResizeObserver before React Flow builds any.
import "./lib/resize-observer-fix";

import { applyTheme, storedTheme } from "./lib/theme";

// Before the first paint, so the saved theme never flashes the wrong colours.
applyTheme(storedTheme());

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Belt and braces: if anything still trips the notice, keep it off the overlay.
window.addEventListener(
  "error",
  (e) => {
    if (e.message?.includes("ResizeObserver loop")) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  },
  true,
);

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// https://bun.com/docs/bundler/hot-reloading#import-meta-hot-data
(import.meta.hot.data.root ??= createRoot(elem)).render(app);
