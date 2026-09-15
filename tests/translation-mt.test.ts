import { afterEach, describe, expect, it } from 'vitest';
import {
  chunkItems,
  clearMtProviders,
  extractPlaceholders,
  findInconsistentTranslations,
  formalityForLanguage,
  glossaryForLanguage,
  pickReferenceUnits,
  placeholdersIntact,
  registerMtProvider,
  resolveMtProviders,
  type TranslationMtProvider,
} from '../src/mt.js';

const provider = (
  key: string,
  supports?: (lang: string) => boolean,
): TranslationMtProvider => ({
  key,
  supportsLanguage: supports,
  translateBatch: async () => [],
});

afterEach(clearMtProviders);

describe('placeholder integrity', () => {
  it('extracts unique sorted placeholder tokens', () => {
    expect(extractPlaceholders('Hi {name}, {count} of {count}')).toEqual([
      'count',
      'name',
    ]);
    expect(extractPlaceholders('no tokens')).toEqual([]);
  });

  it('extracts every supported FormatSimple variable-name style', () => {
    expect(
      extractPlaceholders('{0} {user.name} {item-count} {名前}', 'simple'),
    ).toEqual(['0', 'item-count', 'user.name', '名前']);
  });

  it('accepts translations that keep the placeholder set exactly', () => {
    expect(placeholdersIntact('Hi {name}', 'Hola {name}')).toBe(true);
    expect(placeholdersIntact('Hi {name}', 'Hola {nombre}')).toBe(false);
    expect(placeholdersIntact('{a} and {b}', 'solo {a}')).toBe(false);
    expect(placeholdersIntact('plain', 'plano')).toBe(true);
  });

  it('understands nested ICU arguments without treating choice bodies as placeholders', () => {
    const source =
      '{gender, select, female {{n, plural, one {# mission} other {# missions}}} other {{n, plural, one {# mission} other {# missions}}}}';
    expect(extractPlaceholders(source, 'icu')).toEqual(['gender', 'n']);
    expect(
      placeholdersIntact(
        source,
        '{gender, select, female {{n, plural, one {# misión} other {# misiones}}} other {{n, plural, one {# misión} other {# misiones}}}}',
        'icu',
      ),
    ).toBe(true);
  });

  it('recognizes ICU number, date, time, select, plural, and ordinal arguments', () => {
    const message =
      '{count, number} {day, date, short} {at, time, short} {audience, select, staff {Staff} other {Everyone}} {items, plural, one {One} other {Many}} {place, selectordinal, one {First} other {Later}}';
    expect(extractPlaceholders(message, 'icu')).toEqual([
      'at',
      'audience',
      'count',
      'day',
      'items',
      'place',
    ]);
  });

  it('allows a translation to omit a legacy English suffix variable', () => {
    expect(placeholdersIntact('{n} mission{s}', '{n} misión', 'simple')).toBe(
      true,
    );
  });
});

describe('provider registry + per-language resolution', () => {
  it('puts the preferred provider first when it supports the language', () => {
    registerMtProvider(provider('claude'));
    registerMtProvider(provider('deepl', (lang) => lang !== 'sw' && lang !== 'ur'));
    expect(resolveMtProviders('es', 'deepl').map((p) => p.key)).toEqual([
      'deepl',
      'claude',
    ]);
  });

  it('falls through the chain when the preferred provider lacks the language', () => {
    registerMtProvider(provider('claude'));
    registerMtProvider(provider('deepl', (lang) => lang !== 'sw' && lang !== 'ur'));
    // DeepL has no Swahili — the chain must not offer it for sw (Plan 017 §7.4).
    expect(resolveMtProviders('sw', 'deepl').map((p) => p.key)).toEqual(['claude']);
  });

  it('uses registration order when no preference is set', () => {
    registerMtProvider(provider('claude'));
    registerMtProvider(provider('libretranslate'));
    expect(resolveMtProviders('es').map((p) => p.key)).toEqual([
      'claude',
      'libretranslate',
    ]);
  });
});

describe('glossary + batching', () => {
  it('selects global and language-specific glossary entries', () => {
    const glossary = [
      { term: 'Serve' }, // global keep-as-is
      { term: 'mission', translation: 'misión', language: 'es' },
      { term: 'mission', translation: 'mission', language: 'fr' },
    ];
    expect(glossaryForLanguage(glossary, 'es')).toEqual([
      { term: 'Serve' },
      { term: 'mission', translation: 'misión', language: 'es' },
    ]);
  });

  it('chunks deterministically', () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkItems([], 3)).toEqual([]);
    expect(() => chunkItems([1], 0)).toThrow();
  });
});

describe('formality resolution', () => {
  it('per-language override beats the app default', () => {
    expect(formalityForLanguage(['formal', 'de:informal'], 'de')).toBe('informal');
    expect(formalityForLanguage(['formal', 'de:informal'], 'es')).toBe('formal');
    expect(formalityForLanguage(['de:formal'], 'es')).toBeUndefined();
    expect(formalityForLanguage(['garbage'], 'de')).toBeUndefined();
    expect(formalityForLanguage([], 'de')).toBeUndefined();
  });
});

const entry = (
  key: string,
  sourceText: string,
  units: Record<string, { text: string; state: string }>,
  namespace = key.split('.')[0],
) => ({ key, namespace, sourceText, units });

describe('consistency audit', () => {
  it('flags identical source text translated differently', () => {
    const conflicts = findInconsistentTranslations(
      [
        entry('nav.save', 'Save', { es: { text: 'Guardar', state: 'reviewed' } }),
        entry('form.save', 'Save', { es: { text: 'Salvar', state: 'reviewed' } }),
        entry('other.save', 'Save', { es: { text: 'Guardar', state: 'machine' } }),
        entry('nav.home', 'Home', { es: { text: 'Inicio', state: 'reviewed' } }),
      ],
      'es',
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].sourceText).toBe('Save');
    expect(conflicts[0].variants).toEqual([
      { text: 'Guardar', keys: ['nav.save', 'other.save'] },
      { text: 'Salvar', keys: ['form.save'] },
    ]);
  });

  it('ignores untranslated cells and reports nothing when consistent', () => {
    const conflicts = findInconsistentTranslations(
      [
        entry('a.save', 'Save', { es: { text: 'Guardar', state: 'reviewed' } }),
        entry('b.save', 'Save', {}),
      ],
      'es',
    );
    expect(conflicts).toEqual([]);
  });
});

describe('reference picker (translation memory)', () => {
  it('prefers same-namespace reviewed units, then shortest overall', () => {
    const refs = pickReferenceUnits(
      [
        entry('nav.home', 'Home', { es: { text: 'Inicio', state: 'reviewed' } }),
        entry('nav.missions', 'Missions', { es: { text: 'Misiones', state: 'reviewed' } }),
        entry('account.title', 'Account', { es: { text: 'Cuenta', state: 'reviewed' } }),
        entry('account.machine', 'Draft', { es: { text: 'Borrador', state: 'machine' } }),
      ],
      'es',
      ['nav'],
      3,
    );
    expect(refs.map((r) => r.sourceText)).toEqual(['Home', 'Missions', 'Account']);
    expect(refs[0].text).toBe('Inicio');
  });
});
