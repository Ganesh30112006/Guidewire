import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n"; // initialise i18next before first render
import { captureException } from "@/lib/monitoring";

// Catch uncaught promise rejections globally so they don't silently disappear.
window.addEventListener("unhandledrejection", (event) => {
  captureException(event.reason, { source: "unhandledrejection" });
});

// Catch uncaught synchronous errors that escape React's error boundary.
window.addEventListener("error", (event) => {
  captureException(event.error ?? event.message, { source: "window.onerror" });
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found in document");
createRoot(rootElement).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
