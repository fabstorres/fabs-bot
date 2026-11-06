import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/figtree";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { App } from "./App";
import { pcBridge } from "./pcBridge";
import { connect } from "./store";
import { Toaster } from "@/components/ui/sonner";

const titleBar = pcBridge?.titleBar === "darwin" || pcBridge?.windowControls ? pcBridge?.titleBar : undefined;
if (titleBar) document.documentElement.dataset.titleBar = titleBar;
const toastOffset = titleBar ? { top: 64 } : undefined;

connect();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster position="top-right" offset={toastOffset} mobileOffset={toastOffset} />
  </StrictMode>,
);
