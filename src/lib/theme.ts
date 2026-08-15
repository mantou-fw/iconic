import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark" | "autocad";
export type ResolvedTheme = "light" | "dark" | "autocad";

const KEY = "av-schematic-theme";

/**
 * Stored in localStorage rather than Dexie: the theme has to be applied
 * synchronously on first paint, and an async read would flash the wrong one.
 */
const PREFS: ThemePref[] = ["system", "light", "dark", "autocad"];

export function storedTheme(): ThemePref {
  const raw = localStorage.getItem(KEY) as ThemePref | null;
  return raw && PREFS.includes(raw) ? raw : "system";
}

const prefersDark = () =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

export const resolveTheme = (pref: ThemePref): ResolvedTheme =>
  pref === "system" ? (prefersDark() ? "dark" : "light") : pref;

/**
 * Stamps the resolved theme onto <html>. Because JS always writes a concrete
 * light/dark value, the stylesheet only needs one dark block keyed on the
 * attribute — no duplicated media-query copy to keep in sync.
 */
export function applyTheme(pref: ThemePref) {
  document.documentElement.dataset.theme = resolveTheme(pref);
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => storedTheme());
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme(storedTheme()),
  );

  useEffect(() => {
    applyTheme(pref);
    setResolved(resolveTheme(pref));
    localStorage.setItem(KEY, pref);
    if (pref !== "system") return;

    // Follow the OS while set to system.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyTheme("system");
      setResolved(resolveTheme("system"));
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [pref]);

  return {
    theme: pref,
    resolved,
    setTheme: useCallback((t: ThemePref) => setPref(t), []),
  };
}

/** Resolved theme, for the few places that must branch on it in JS. */
export const ThemeContext = createContext<ResolvedTheme>("light");
export const useResolvedTheme = () => useContext(ThemeContext);
