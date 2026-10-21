import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AR } from "@/i18n";

export type Lang = "en" | "ar";
const KEY = "arrissa-lang";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (en: string, vars?: Record<string, string | number>) => string };
const I18nContext = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (s) => s });

function fill(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** English text is the key; Arabic comes from the dictionary and falls back to English. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "ar" || saved === "en") setLangState(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  const setLang = useCallback((l: Lang) => { setLangState(l); window.localStorage.setItem(KEY, l); }, []);
  const t = useCallback((en: string, vars?: Record<string, string | number>) => fill(lang === "ar" ? AR[en] ?? en : en, vars), [lang]);
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useT = () => useContext(I18nContext).t;

export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "ar" ? "en" : "ar")}
      aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
      className={className ?? "rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"}
    >
      {lang === "ar" ? "EN" : "عربي"}
    </button>
  );
}

/** Short explanation box: what this page/feature is for. */
export function HelpNote({ children }: { children: string }) {
  const t = useT();
  return (
    <p className="rounded-xl border border-primary/30 bg-accent/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
      <span className="font-semibold text-primary-glow">{t("What is this?")} </span>
      {t(children)}
    </p>
  );
}
