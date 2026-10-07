/**
 * Framework-light translation core (Plan 014, P1.5). Pure TS, dependency-free —
 * the portable heart shared by the React subpath and any non-React consumer, so
 * a hosted app can use it without pulling React.
 *
 * Preserves Tolgee's `t(key, defaultValue?, params?)` semantics so serve's
 * ~1,302 call sites (with inline English defaults) are a drop-in swap:
 *   - default formatting is FormatSimple-style `{named}` interpolation (exactly
 *     what serve uses today), so imported strings render identically;
 *   - keys marked `format:'icu'` use standards-based ICU MessageFormat with
 *     the active BCP-47 locale, including plural/select/selectordinal.
 */
import { localeDirection } from '../languages.js';
import IntlMessageFormat from 'intl-messageformat';

export type MessageFormat = 'simple' | 'icu';

/** ICU keys retain their format beside the string in mixed-format catalogs. */
export interface FormattedTranslationMessage {
  message: string;
  format: MessageFormat;
}

export type TranslationMessage = string | FormattedTranslationMessage;

/** key → message template, for a single language. */
export type TranslationMessages = Record<string, TranslationMessage>;

/**
 * Development pseudo-locale used by chrome coverage checks. Keeping this in
 * the framework-light core means React and non-React clients exercise the
 * exact same fallback path. The wrapper makes missed layout allowance visible;
 * the accented glyphs make an untranslated English fallback unmistakable.
 */
export function pseudoLocalize(message: string): string {
  const accents: Record<string, string> = {
    A: 'Å', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'Ë', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Ï',
    J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ', N: 'Ñ', O: 'Ö', P: 'Ƥ', Q: 'Ǫ', R: 'Ŕ',
    S: 'Š', T: 'Ŧ', U: 'Ü', V: 'Ṽ', W: 'Ŵ', X: 'Ẍ', Y: 'Ŷ', Z: 'Ž',
    a: 'å', b: 'ƀ', c: 'ç', d: 'đ', e: 'ë', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'ï',
    j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ṁ', n: 'ñ', o: 'ö', p: 'ƥ', q: 'ǫ', r: 'ŕ',
    s: 'š', t: 'ŧ', u: 'ü', v: 'ṽ', w: 'ŵ', x: 'ẍ', y: 'ŷ', z: 'ž',
  };
  const accented = message.replace(/[A-Za-z]/g, (character) => accents[character]);
  return `［${accented} ···］`;
}

/** FormatSimple: replace `{name}` placeholders with `params.name`. Unknown → left as-is. */
export function interpolate(
  template: string,
  params?: Record<string, unknown>,
): string {
  if (!params) return template;
  return template.replace(
    /\{\s*([\p{L}\p{N}_][\p{L}\p{N}\p{M}_.-]*)\s*\}/gu,
    (whole, name) =>
      name in params ? String(params[name] ?? '') : whole,
  );
}

const ICU_CACHE_LIMIT = 500;
const icuCache = new Map<string, IntlMessageFormat>();

function compiledIcu(template: string, locale: string): IntlMessageFormat {
  const key = `${locale}\u0000${template}`;
  const cached = icuCache.get(key);
  if (cached) return cached;
  const compiled = new IntlMessageFormat(template, locale, undefined, {
    ignoreTag: true,
  });
  if (icuCache.size >= ICU_CACHE_LIMIT) {
    icuCache.delete(icuCache.keys().next().value as string);
  }
  icuCache.set(key, compiled);
  return compiled;
}

/**
 * Full ICU MessageFormat using the active locale's CLDR plural rules. Invalid
 * authoring data never crashes the host app: the unformatted template remains
 * visible and Translation Studio reports the syntax error for repair.
 */
export function formatIcu(
  template: string,
  params?: Record<string, unknown>,
  locale = 'en',
): string {
  try {
    const result = compiledIcu(template, locale).format(params as any);
    return Array.isArray(result) ? result.join('') : String(result);
  } catch {
    return interpolate(template, params);
  }
}

/**
 * Resolve `key` against a message map, falling back to the inline default (then
 * the key itself), and format with params. This is what the client `t()` calls.
 */
export function translate(
  messages: TranslationMessages,
  key: string,
  defaultValue?: string,
  params?: Record<string, unknown>,
  format: MessageFormat = 'simple',
  locale = 'en',
): string {
  const stored = messages[key];
  const template =
    typeof stored === 'string'
      ? stored
      : stored?.message ?? defaultValue ?? key;
  const resolvedFormat =
    typeof stored === 'object' ? stored.format : format;
  const formatted = resolvedFormat === 'icu'
    ? formatIcu(template, params, locale)
    : interpolate(template, params);
  return stored === undefined && locale.toLowerCase() === 'en-xa'
    ? pseudoLocalize(formatted)
    : formatted;
}

/** @deprecated Use directionFor; this historical set is not a support boundary. */
export const RTL_LANGUAGES = new Set(['ar', 'ur']);

export function directionFor(language: string): 'ltr' | 'rtl' {
  try { return localeDirection(language); } catch { return 'ltr'; }
}
