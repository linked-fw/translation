/**
 * Framework-light translation core (Plan 014, P1.5). Pure TS, dependency-free —
 * the portable heart shared by the React subpath and any non-React consumer, so
 * a hosted app can use it without pulling React.
 *
 * Preserves Tolgee's `t(key, defaultValue?, params?)` semantics so serve's
 * ~1,302 call sites (with inline English defaults) are a drop-in swap:
 *   - default formatting is FormatSimple-style `{named}` interpolation (exactly
 *     what serve uses today), so imported strings render identically;
 *   - keys marked `format:'icu'` get minimal plural handling. Full ICU (per-
 *     language plural rules) is the P5 upgrade — this keeps `{count} {shiftWord}`
 *     workarounds working meanwhile.
 */

/** key → message template, for a single language. */
export type TranslationMessages = Record<string, string>;

export type MessageFormat = 'simple' | 'icu';

/** FormatSimple: replace `{name}` placeholders with `params.name`. Unknown → left as-is. */
export function interpolate(
  template: string,
  params?: Record<string, unknown>,
): string {
  if (!params) return template;
  return template.replace(/\{\s*(\w+)\s*\}/g, (whole, name) =>
    name in params ? String(params[name] ?? '') : whole,
  );
}

/**
 * Minimal ICU: `{var, plural, one {…} other {…}}` (plus explicit `=N {…}`), with
 * `#` substituted by the count, and `{named}` interpolation elsewhere. English
 * cardinal rule (one iff n===1). NOT a full ICU implementation — P5 swaps in a
 * real per-language plural engine behind this same signature.
 */
export function formatIcu(
  template: string,
  params?: Record<string, unknown>,
): string {
  const p = params ?? {};
  let result = '';
  let i = 0;
  while (i < template.length) {
    const start = template.indexOf('{', i);
    if (start === -1) {
      result += template.slice(i);
      break;
    }
    result += template.slice(i, start);
    // Scan to the brace that balances `start` (handles one-level-nested cases).
    let depth = 0;
    let j = start;
    for (; j < template.length; j++) {
      if (template[j] === '{') depth++;
      else if (template[j] === '}' && --depth === 0) break;
    }
    const inner = template.slice(start + 1, j); // contents between the braces
    const plural = inner.match(/^\s*(\w+)\s*,\s*plural\s*,\s*([\s\S]*)$/);
    if (plural) {
      const [, varName, body] = plural;
      const n = Number(p[varName] ?? 0);
      const cases: Record<string, string> = {};
      const caseRe = /(=\d+|zero|one|two|few|many|other)\s*\{([^{}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = caseRe.exec(body))) cases[m[1]] = m[2];
      const chosen =
        cases[`=${n}`] ?? (n === 1 ? cases.one : undefined) ?? cases.other ?? '';
      result += chosen.replace(/#/g, String(n));
    } else {
      // Not a plural block → treat as a simple {name} placeholder.
      const name = inner.trim();
      result += name in p ? String(p[name] ?? '') : template.slice(start, j + 1);
    }
    i = j + 1;
  }
  return result;
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
): string {
  const template = messages[key] ?? defaultValue ?? key;
  return format === 'icu'
    ? formatIcu(template, params)
    : interpolate(template, params);
}

/** RTL languages (Plan 014 §13 canon). */
export const RTL_LANGUAGES = new Set(['ar', 'ur']);

export function directionFor(language: string): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
}
