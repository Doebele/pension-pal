import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ToastProvider } from "./components/notifications/ToastProvider";
import { NavigationLockProvider } from "./context/NavigationLockContext";
import { queryClient } from "./services/queryClient";
import "./i18n";
// Fira Sans selbst gehostet, nur die vier Schnitte Thin, Light, Normal, Bold
import "@fontsource/fira-sans/100.css";
import "@fontsource/fira-sans/300.css";
import "@fontsource/fira-sans/400.css";
import "@fontsource/fira-sans/700.css";
import "../styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <NavigationLockProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </NavigationLockProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

