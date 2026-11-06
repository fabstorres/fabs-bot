import type { CSSProperties } from "react";
import { create } from "zustand";
import { pcBridge } from "./pcBridge";

export type Theme = "light" | "dark" | "system";
export type Accent = "neutral" | "bot";

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function savedTheme(): Theme {
  const theme = localStorage.getItem("theme");
  return theme === "light" || theme === "dark" ? theme : "system";
}

function savedAccent(): Accent {
  return localStorage.getItem("accent") === "bot" ? "bot" : "neutral";
}

export const useTheme = create(() => ({ theme: savedTheme(), accent: savedAccent() }));

function applyTheme() {
  const { theme } = useTheme.getState();
  const dark = theme === "dark" || (theme === "system" && systemDark.matches);
  document.documentElement.classList.toggle("dark", dark);
  if (pcBridge?.titleBar) void pcBridge.setDarkTitleBar?.(dark);
}

export function setTheme(theme: Theme) {
  if (theme === "system") localStorage.removeItem("theme");
  else localStorage.setItem("theme", theme);
  useTheme.setState({ theme });
  applyTheme();
}

export function setAccent(accent: Accent) {
  if (accent === "neutral") localStorage.removeItem("accent");
  else localStorage.setItem("accent", accent);
  useTheme.setState({ accent });
}

const linear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

export function accentStyle(color: string): CSSProperties | undefined {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  const rgb = [1, 3, 5].map((i) => Math.round(parseInt(color.slice(i, i + 2), 16) * 0.8));
  const [r, g, b] = rgb.map((channel) => linear(channel / 255));
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  const nearBlack = luminance < 0.01;
  if (nearBlack) return;
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / (linear(17 / 255) + 0.05);
  const darkText = darkContrast > whiteContrast;
  return { "--bubble-user": `rgb(${rgb.join(" ")})`, "--bubble-user-foreground": darkText ? "#111111" : "#ffffff" } as CSSProperties;
}

systemDark.addEventListener("change", applyTheme);
applyTheme();
