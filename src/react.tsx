import {
  languageFallbacks,
  type TranslationLanguageDefinition,
} from './languages.js';
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
  pseudoExpand,
  pseudoLocalize,
  translate,
  type TranslationMessages,
} from './core/messages.js';

const PREVIEW_CONDITIONS_EVENT = 'create-now:preview-conditions';
const PREVIEW_LOCALE_ADAPTER = 'https://create.now/shacl/PreviewLocaleAdapter';
const PREVIEW_DIRECTION_ADAPTER =
  'https://create.now/shacl/PreviewDirectionAdapter';
const PREVIEW_PSEUDO_LOCALE_ADAPTER =
  'https://create.now/shacl/PreviewPseudoLocaleAdapter';

type PreviewPseudoLocale = 'off' | 'accented' | 'expanded';
type PreviewDirection = 'auto' | 'ltr' | 'rtl';

interface PreviewRuntimeCondition {
  readonly adapterIri?: unknown;
  readonly value?: unknown;
}

/**
 * Read one adapter's value from a `create-now:preview-conditions` event. The
 * event's `detail.conditions` is a list of `{adapterIri, value}`; anything
 * malformed reads as "no condition".
 */
function previewConditionValue(event: Event, adapterIri: string): unknown {
  const conditions = (event as CustomEvent<{ conditions?: unknown }>).detail
    ?.conditions;
  if (!Array.isArray(conditions)) return undefined;
  return (conditions as PreviewRuntimeCondition[]).find(
    (condition) => condition?.adapterIri === adapterIri
  )?.value;
}

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
  direction?: 'ltr' | 'rtl';
  fallback?: string;
}

export interface TranslationCallOptions {
  /** Explicit syntax for an inline default before per-key catalog metadata loads. */
  format?: MessageFormat;
}

interface TranslationContextValue {
  t: (
    key: string,
    defaultValue?: string,
    params?: Record<string, unknown>,
    options?: TranslationCallOptions
  ) => string;
  language: string;
  setLanguage: (tag: string) => void;
  languages: TranslationLanguage[];
  dir: 'ltr' | 'rtl';
}

const TranslationContext = createContext<TranslationContextValue | null>(null);

export interface TranslationProviderProps {
  children: React.ReactNode;
  languages: TranslationLanguage[];
  /** Optional live catalog metadata, refreshed independently of an app build. */
  loadLanguages?: () => Promise<TranslationLanguageDefinition[]>;
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
  languages: initialLanguages,
  loadLanguages,
  defaultLanguage = 'en',
  format = 'simple',
  loadMessages,
  storageKey = 'linked.lang',
}: TranslationProviderProps) {
  const [remoteLanguages, setRemoteLanguages] =
    useState<TranslationLanguageDefinition[]>();
  const languages = remoteLanguages
    ? remoteLanguages
        .filter((item) => item.enabled && item.supported)
        .map((item) => ({
          tag: item.code,
          label: item.nativeName,
          direction: item.direction,
          fallback: item.fallback,
        }))
    : initialLanguages;
  const [language, setLanguageState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage?.getItem(storageKey);
      if (stored && languages.some((l) => l.tag === stored)) return stored;
    }
    return defaultLanguage;
  });
  const [previewLanguage, setPreviewLanguage] = useState<string | null>(null);
  const [previewPseudoLocale, setPreviewPseudoLocale] =
    useState<PreviewPseudoLocale>('off');
  const [previewDirection, setPreviewDirection] =
    useState<PreviewDirection>('auto');
  const effectiveLanguage = previewLanguage ?? language;
  // A preview direction is an editor coordinate and wins; otherwise the
  // configured language's own direction, then the tag's script default.
  const dir =
    previewDirection === 'ltr' || previewDirection === 'rtl'
      ? previewDirection
      : (languages.find((item) => item.tag === effectiveLanguage)?.direction ??
        directionFor(effectiveLanguage));
  useEffect(() => {
    if (!loadLanguages) return;
    let cancelled = false;
    loadLanguages()
      .then((items) => {
        if (!cancelled) {
          setRemoteLanguages(items);
          setMessagesByLang({});
          const stored =
            typeof window !== 'undefined'
              ? window.localStorage?.getItem(storageKey)
              : null;
          if (
            stored &&
            items.some(
              (item) => item.code === stored && item.enabled && item.supported
            )
          )
            setLanguageState(stored);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loadLanguages, storageKey]);
  const [messagesByLang, setMessagesByLang] = useState<
    Record<string, TranslationMessages>
  >({});

  // Load the active language's messages once. English renders from inline
  // defaults until (and if) a payload arrives, so the app is never blank.
  useEffect(() => {
    if (messagesByLang[effectiveLanguage]) return;
    let cancelled = false;
    const chain = languageFallbacks(
      effectiveLanguage,
      defaultLanguage,
      remoteLanguages
    ).reverse();
    Promise.all(chain.map((code) => loadMessages(code).catch(() => ({}))))
      .then((maps) => Object.assign({}, ...maps) as TranslationMessages)
      .then((msgs) => {
        if (!cancelled) {
          setMessagesByLang((prev) => ({
            ...prev,
            [effectiveLanguage]: msgs,
          }));
        }
      })
      .catch(() => {
        /* offline / missing → keep inline defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [
    effectiveLanguage,
    loadMessages,
    messagesByLang,
    defaultLanguage,
    remoteLanguages,
  ]);

  // Preview locale is an ephemeral editor coordinate. It intentionally does
  // not call setLanguage(), because doing so would persist a test condition as
  // the app user's real language preference.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPreviewConditions = (event: Event) => {
      const nextLanguage = previewConditionValue(event, PREVIEW_LOCALE_ADAPTER);
      const nextPseudoLocale = previewConditionValue(
        event,
        PREVIEW_PSEUDO_LOCALE_ADAPTER
      );
      const nextDirection = previewConditionValue(
        event,
        PREVIEW_DIRECTION_ADAPTER
      );
      setPreviewLanguage(
        typeof nextLanguage === 'string' && nextLanguage ? nextLanguage : null
      );
      setPreviewPseudoLocale(
        nextPseudoLocale === 'accented' || nextPseudoLocale === 'expanded'
          ? nextPseudoLocale
          : 'off'
      );
      setPreviewDirection(
        nextDirection === 'ltr' || nextDirection === 'rtl'
          ? nextDirection
          : 'auto'
      );
    };
    window.addEventListener(PREVIEW_CONDITIONS_EVENT, onPreviewConditions);
    return () =>
      window.removeEventListener(PREVIEW_CONDITIONS_EVENT, onPreviewConditions);
  }, []);

  // Reflect the effective language and text direction on <html>.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = dir;
      document.documentElement.lang = effectiveLanguage;
    }
  }, [effectiveLanguage, dir]);

  const setLanguage = useCallback(
    (tag: string) => {
      setLanguageState(tag);
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem(storageKey, tag);
      }
    },
    [storageKey]
  );

  const t = useCallback(
    (
      key: string,
      defaultValue?: string,
      params?: Record<string, unknown>,
      options?: TranslationCallOptions
    ) => {
      const translated = translate(
        messagesByLang[effectiveLanguage] ?? {},
        key,
        defaultValue,
        params,
        options?.format ?? format,
        effectiveLanguage
      );
      if (previewPseudoLocale === 'accented') {
        return effectiveLanguage.toLowerCase() === 'en-xa'
          ? translated
          : pseudoLocalize(translated);
      }
      return previewPseudoLocale === 'expanded'
        ? pseudoExpand(translated)
        : translated;
    },
    [messagesByLang, effectiveLanguage, format, previewPseudoLocale]
  );

  const value = useMemo<TranslationContextValue>(
    () => ({ t, language: effectiveLanguage, setLanguage, languages, dir }),
    [t, effectiveLanguage, setLanguage, languages, dir]
  );

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}

function useTranslationContext(hook: string): TranslationContextValue {
  const ctx = useContext(TranslationContext);
  if (!ctx)
    throw new Error(`${hook} must be used within a <TranslationProvider>`);
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
  format,
}: {
  keyName: string;
  defaultValue?: string;
  params?: Record<string, unknown>;
  format?: MessageFormat;
}) {
  const { t } = useTranslate();
  return <>{t(keyName, defaultValue, params, { format })}</>;
}
