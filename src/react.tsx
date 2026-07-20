import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  directionFor,
  type MessageFormat,
  translate,
  type TranslationMessages,
} from './core/messages.js';

/**
 * React binding for the translation core (Plan 014 P1.5). Kept in a `/react`
 * subpath so non-React consumers use `./core/messages` without pulling React.
 * Message LOADING is caller-injected (`loadMessages`) so this stays transport-
 * agnostic: dev wires it to CN's API, prod to the bundled `{lang}.json` with a
 * CDN overlay (AD-J/AD-K) — the provider doesn't care which.
 *
 * The hook shape mirrors Tolgee (`useTranslate().t(key, default, params)`,
 * `useLanguage()`), so swapping serve's provider touches only its i18n file.
 */

export interface TranslationLanguage {
  tag: string; // BCP-47
  label: string;
}

interface TranslationContextValue {
  t: (key: string, defaultValue?: string, params?: Record<string, unknown>) => string;
  language: string;
  setLanguage: (tag: string) => void;
  languages: TranslationLanguage[];
  dir: 'ltr' | 'rtl';
}

const TranslationContext = createContext<TranslationContextValue | null>(null);

export interface TranslationProviderProps {
  children: React.ReactNode;
  languages: TranslationLanguage[];
  defaultLanguage?: string;
  /** Global message format. 'simple' = FormatSimple (Tolgee-compatible default). */
  format?: MessageFormat;
  /** Caller-injected loader: dev→API, prod→bundled file then CDN overlay. */
  loadMessages: (language: string) => Promise<TranslationMessages>;
  /** localStorage key persisting the selected language. */
  storageKey?: string;
}

export function TranslationProvider({
  children,
  languages,
  defaultLanguage = 'en',
  format = 'simple',
  loadMessages,
  storageKey = 'linked.lang',
}: TranslationProviderProps) {
  const [language, setLanguageState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage?.getItem(storageKey);
      if (stored && languages.some((l) => l.tag === stored)) return stored;
    }
    return defaultLanguage;
  });
  const [messagesByLang, setMessagesByLang] = useState<
    Record<string, TranslationMessages>
  >({});

  // Load the active language's messages once. English renders from inline
  // defaults until (and if) a payload arrives, so the app is never blank.
  useEffect(() => {
    if (messagesByLang[language]) return;
    let cancelled = false;
    loadMessages(language)
      .then((msgs) => {
        if (!cancelled) {
          setMessagesByLang((prev) => ({ ...prev, [language]: msgs }));
        }
      })
      .catch(() => {
        /* offline / missing → keep inline defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [language, loadMessages, messagesByLang]);

  // Reflect text direction on <html> (RTL for ar/ur).
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = directionFor(language);
    }
  }, [language]);

  const setLanguage = useCallback(
    (tag: string) => {
      setLanguageState(tag);
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem(storageKey, tag);
      }
    },
    [storageKey],
  );

  const t = useCallback(
    (key: string, defaultValue?: string, params?: Record<string, unknown>) =>
      translate(messagesByLang[language] ?? {}, key, defaultValue, params, format),
    [messagesByLang, language, format],
  );

  const value = useMemo<TranslationContextValue>(
    () => ({ t, language, setLanguage, languages, dir: directionFor(language) }),
    [t, language, setLanguage, languages],
  );

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}

function useTranslationContext(hook: string): TranslationContextValue {
  const ctx = useContext(TranslationContext);
  if (!ctx) throw new Error(`${hook} must be used within a <TranslationProvider>`);
  return ctx;
}

/** Tolgee-compatible: `const { t } = useTranslate()`. */
export function useTranslate() {
  const ctx = useTranslationContext('useTranslate');
  return { t: ctx.t };
}

/** Active language + switcher + direction + the available languages. */
export function useLanguage() {
  const ctx = useTranslationContext('useLanguage');
  return {
    language: ctx.language,
    setLanguage: ctx.setLanguage,
    languages: ctx.languages,
    dir: ctx.dir,
  };
}

/** JSX convenience (Tolgee `<T keyName=… />`). */
export function T({
  keyName,
  defaultValue,
  params,
}: {
  keyName: string;
  defaultValue?: string;
  params?: Record<string, unknown>;
}) {
  const { t } = useTranslate();
  return <>{t(keyName, defaultValue, params)}</>;
}
