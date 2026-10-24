import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/figtree";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { App } from "./App";
import { connect } from "./store";
import { Toaster } from "@/components/ui/sonner";

connect();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster position="top-right" />
  </StrictMode>,
);
