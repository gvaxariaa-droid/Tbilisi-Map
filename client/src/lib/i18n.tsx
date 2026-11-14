import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { KA } from './i18n-ka.ts';
import { setDateLocale } from './format.ts';

export type Lang = 'en' | 'ka';
type Vars = Record<string, string | number>;

const KEY = 'tpm.lang';

function initialLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'ka' || v === 'en') return v;
  } catch {
    /* storage unavailable */
  }
  return 'en';
}

/**
 * Translate an English source string. English text is the key, so untranslated
 * strings fall back to English instead of showing a code. `{name}` placeholders are filled from vars.
 */
export function translate(lang: Lang, text: string, vars?: Vars): string {
  let out = lang === 'ka' ? (KA[text] ?? text) : text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

interface I18nValue {
  lang: Lang;
  setLang(l: Lang): void;
  t(text: string, vars?: Vars): string;
}

const I18nContext = createContext<I18nValue>({ lang: 'en', setLang: () => {}, t: (s, v) => translate('en', s, v) });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  setDateLocale(lang === 'ka' ? 'ka-GE' : 'en-GB');

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* keep working without storage */
    }
  }, [lang]);

  const t = useCallback((text: string, vars?: Vars) => translate(lang, text, vars), [lang]);
  return <I18nContext.Provider value={{ lang, setLang: setLangState, t }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

/* ----------------------------------------------------------------- theme */

export type Theme = 'light' | 'dark';

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0F161F' : '#F2F4F3');
    try {
      localStorage.setItem('tpm.theme', theme);
    } catch {
      /* keep working without storage */
    }
  }, [theme]);
  return [theme, setTheme];
}
