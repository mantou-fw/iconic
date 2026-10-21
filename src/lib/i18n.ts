import { useCallback, useSyncExternalStore } from "react";
import en from "../locales/en.json";
import zhHant from "../locales/zh-Hant.json";
import ja from "../locales/ja.json";

export const LOCALES = ["en", "zh-Hant", "ja"] as const;
export type Locale = (typeof LOCALES)[number];
const catalogs: Record<Locale, Record<string, string>> = {
  en,
  "zh-Hant": zhHant,
  ja,
};
const listeners = new Set<() => void>();
let locale: Locale = "en";
let initialized = false;
export function resolveLocale(value: string | null | undefined): Locale {
  if (value?.startsWith("zh")) return "zh-Hant";
  if (value?.startsWith("ja")) return "ja";
  return "en";
}
export function initializeLocale() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem("iconic-locale");
  } catch {
    /* Storage can be disabled. */
  }
  setLocale(resolveLocale(stored || navigator.language));
}
export function setLocale(next: Locale) {
  locale = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  try {
    localStorage.setItem("iconic-locale", next);
  } catch {
    /* Keep the in-memory preference. */
  }
  listeners.forEach((notify) => notify());
}
export function translate(key: string, language: Locale = locale): string {
  return catalogs[language][key] ?? catalogs.en[key] ?? key;
}
export const t = (key: string) => translate(key);
export const getLocale = () => locale;
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};
export function useLocale() {
  return useSyncExternalStore(
    subscribe,
    () => locale,
    () => "en" as Locale,
  );
}
export function useT() {
  const language = useLocale();
  return useCallback((key: string) => translate(key, language), [language]);
}
