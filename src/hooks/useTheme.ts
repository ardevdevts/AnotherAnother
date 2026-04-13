import { useState, useEffect } from "react";
import type { ThemePreference } from "../types";

function getInitialThemePreference(): ThemePreference {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "auto") return stored;
  return "auto";
}

function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "auto") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return pref;
}

export function useTheme() {
  const [themePref, setThemePref] = useState<ThemePreference>(getInitialThemePreference);
  const [theme, setTheme] = useState<"light" | "dark">(() => resolveTheme(getInitialThemePreference()));

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("theme", themePref);
    setTheme(resolveTheme(themePref));
    if (themePref === "auto") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => setTheme(resolveTheme("auto"));
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [themePref]);

  const cycleTheme = () => {
    setThemePref((p) => p === "light" ? "dark" : p === "dark" ? "auto" : "light");
  };

  return { theme, themePref, setThemePref, cycleTheme };
}
