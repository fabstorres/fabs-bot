import { create } from "zustand";

export type Theme = "light" | "dark" | "system";

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function savedTheme(): Theme {
  const theme = localStorage.getItem("theme");
  return theme === "light" || theme === "dark" ? theme : "system";
}

export const useTheme = create(() => ({ theme: savedTheme() }));

function applyTheme() {
  const { theme } = useTheme.getState();
  document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && systemDark.matches));
}

export function setTheme(theme: Theme) {
  if (theme === "system") localStorage.removeItem("theme");
  else localStorage.setItem("theme", theme);
  useTheme.setState({ theme });
  applyTheme();
}

systemDark.addEventListener("change", applyTheme);
