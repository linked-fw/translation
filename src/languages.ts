/** Portable language metadata. Codes are open BCP-47 strings, never an enum. */
export interface TranslationLanguageDefinition {
  id: string;
  code: string;
  nativeName: string;
  englishName: string;
  direction: 'ltr' | 'rtl';
  parent?: string;
  fallback?: string;
  enabled: boolean;
  supported: boolean;
}

export function canonicalLocale(code: string): string {
  return (
    Intl.getCanonicalLocales(code.trim())[0] ||
    (() => {
      throw new Error('Language code is required.');
    })()
  );
}

export function localeDirection(code: string): 'ltr' | 'rtl' {
  const locale = new Intl.Locale(canonicalLocale(code));
  const info = (locale as any).getTextInfo?.() ?? (locale as any).textInfo;
  if (info?.direction) return info.direction;
  // Script fallback for engines without Intl.Locale text information. This is
  // a script property, not a closed list of supported languages.
  return /^(Adlm|Arab|Hebr|Nkoo|Rohg|Samr|Syrc|Thaa)$/.test(
    locale.maximize().script ?? ''
  )
    ? 'rtl'
    : 'ltr';
}

export function defineLanguage(
  code: string,
  input: Partial<TranslationLanguageDefinition> = {}
): TranslationLanguageDefinition {
  code = canonicalLocale(code);
  const base = new Intl.Locale(code).language;
  const name = (locale: string) =>
    new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code;
  return {
    id: input.id ?? `https://id.linked.cm/language/${code}`,
    code,
    nativeName: input.nativeName || name(code),
    englishName: input.englishName || name('en'),
    direction: input.direction ?? localeDirection(code),
    ...(base !== code ? { parent: base } : {}),
    ...input,
    enabled: input.enabled ?? true,
    supported: input.supported ?? true,
  };
}

/** Ordered explicit fallback chain, ending at the source; safe against cycles. */
export function languageFallbacks(
  code: string,
  source: string,
  definitions: readonly TranslationLanguageDefinition[] = []
): string[] {
  const byCode = new Map(
    definitions.map((language) => [language.code, language])
  );
  const chain: string[] = [];
  let current: string | undefined = canonicalLocale(code);
  while (current && !chain.includes(current) && current !== source) {
    chain.push(current);
    current = byCode.get(current)?.fallback;
  }
  if (!chain.includes(source)) chain.push(source);
  return chain;
}

export function validateLanguageDefinitions(
  definitions: readonly TranslationLanguageDefinition[]
): void {
  const byCode = new Map(
    definitions.map((language) => [language.code, language])
  );
  if (byCode.size !== definitions.length)
    throw new Error('Duplicate language resources.');
  for (const language of definitions) {
    if (canonicalLocale(language.code) !== language.code)
      throw new Error('Use canonical BCP-47 codes.');
    if (!['ltr', 'rtl'].includes(language.direction))
      throw new Error('Language direction must be ltr or rtl.');
    for (const relation of ['fallback', 'parent'] as const) {
      const visited = new Set([language.code]);
      let target = language[relation];
      while (target) {
        if (visited.has(target))
          throw new Error(`Cyclic language ${relation}: ${language.code}`);
        visited.add(target);
        if (!byCode.has(target))
          throw new Error(`Missing ${relation} language resource: ${target}`);
        target = byCode.get(target)?.[relation];
      }
    }
  }
}
