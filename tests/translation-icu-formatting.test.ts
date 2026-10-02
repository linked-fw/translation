import { describe, expect, it } from 'vitest';
import { formatIcu, translate } from '@_linked/translation/core/messages';
import { compileCatalogs } from '../src/compile.js';
import type { TranslationEntryRecord } from '../src/records.js';

// Behaviour of the ICU path that production catalogs depend on, pinned so an
// intl-messageformat or parser upgrade that changes rendered output fails here
// rather than in a shipped UI. Expected values for locale-sensitive formats are
// derived from Intl directly, so the tests check our wiring, not the ICU data
// bundled with whichever Node runs them.

const LOCALES = ['en', 'nl', 'de', 'fr', 'es', 'pt-BR', 'pl', 'ru', 'tr', 'ar', 'hi', 'ja', 'zh'];

describe('ICU plurals across production locales', () => {
  const message = '{n, plural, zero {zero} one {one} two {two} few {few} many {many} other {other}}';

  for (const locale of LOCALES) {
    it(`selects the CLDR plural category for ${locale}`, () => {
      const rules = new Intl.PluralRules(locale);
      for (const n of [0, 1, 2, 3, 5, 11, 21, 22, 25, 100, 1.5]) {
        expect(formatIcu(message, { n }, locale)).toBe(rules.select(n));
      }
    });
  }

  it('prefers exact matches over categories and formats # with the locale', () => {
    const message = '{n, plural, =0 {nothing} =1 {exactly one} other {# items}}';
    expect(formatIcu(message, { n: 0 }, 'en')).toBe('nothing');
    expect(formatIcu(message, { n: 1 }, 'en')).toBe('exactly one');
    expect(formatIcu(message, { n: 1234 }, 'de')).toBe(
      `${new Intl.NumberFormat('de').format(1234)} items`,
    );
  });

  it('applies plural offset', () => {
    const message =
      '{n, plural, offset:1 =0 {nobody} =1 {{name}} one {{name} and # other} other {{name} and # others}}';
    expect(formatIcu(message, { n: 1, name: 'Ana' }, 'en')).toBe('Ana');
    expect(formatIcu(message, { n: 2, name: 'Ana' }, 'en')).toBe('Ana and 1 other');
    expect(formatIcu(message, { n: 4, name: 'Ana' }, 'en')).toBe('Ana and 3 others');
  });

  it('selects ordinals per locale', () => {
    const message = '{n, selectordinal, zero {zero} one {one} two {two} few {few} many {many} other {other}}';
    for (const locale of ['en', 'fr', 'nl']) {
      const rules = new Intl.PluralRules(locale, { type: 'ordinal' });
      for (const n of [1, 2, 3, 4, 11, 21, 22, 23, 101]) {
        expect(formatIcu(message, { n }, locale)).toBe(rules.select(n));
      }
    }
  });
});

describe('ICU select', () => {
  const message = '{role, select, admin {Administrator} editor {Editor} other {Member}}';

  it('picks the matching branch and falls back to other', () => {
    expect(formatIcu(message, { role: 'admin' }, 'en')).toBe('Administrator');
    expect(formatIcu(message, { role: 'editor' }, 'en')).toBe('Editor');
    expect(formatIcu(message, { role: 'guest' }, 'en')).toBe('Member');
  });

  it('formats nested arguments inside the selected branch', () => {
    const nested = '{g, select, female {Sie hat {n, number} Punkte} other {Er hat {n, number} Punkte}}';
    expect(formatIcu(nested, { g: 'female', n: 1500 }, 'de')).toBe(
      `Sie hat ${new Intl.NumberFormat('de').format(1500)} Punkte`,
    );
  });
});

describe('ICU number formats', () => {
  for (const locale of LOCALES) {
    it(`formats number, percent and integer styles for ${locale}`, () => {
      expect(formatIcu('{v, number}', { v: 1234567.891 }, locale)).toBe(
        new Intl.NumberFormat(locale).format(1234567.891),
      );
      expect(formatIcu('{v, number, percent}', { v: 0.256 }, locale)).toBe(
        new Intl.NumberFormat(locale, { style: 'percent' }).format(0.256),
      );
      expect(formatIcu('{v, number, integer}', { v: 41.6 }, locale)).toBe(
        new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(41.6),
      );
    });
  }

  it('formats number skeletons: currency, compact, fraction digits', () => {
    expect(formatIcu('{v, number, ::currency/EUR}', { v: 1234.5 }, 'nl')).toBe(
      new Intl.NumberFormat('nl', { style: 'currency', currency: 'EUR' }).format(1234.5),
    );
    expect(formatIcu('{v, number, ::compact-short}', { v: 15300 }, 'en')).toBe(
      new Intl.NumberFormat('en', { notation: 'compact', compactDisplay: 'short' }).format(15300),
    );
    expect(formatIcu('{v, number, ::.00}', { v: 3.1 }, 'fr')).toBe(
      new Intl.NumberFormat('fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(3.1),
    );
  });
});

describe('ICU date formats', () => {
  // Noon UTC, so the calendar day is the same in every timezone a test can run in.
  const when = new Date(Date.UTC(2026, 2, 15, 12, 0, 0));

  for (const locale of LOCALES) {
    it(`formats date styles for ${locale}`, () => {
      expect(formatIcu('{d, date, short}', { d: when }, locale)).toBe(
        new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric', year: '2-digit' }).format(when),
      );
      expect(formatIcu('{d, date, long}', { d: when }, locale)).toBe(
        new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', year: 'numeric' }).format(when),
      );
    });
  }

  it('formats date skeletons and accepts epoch milliseconds', () => {
    expect(formatIcu('{d, date, ::yyyyMMMd}', { d: when.getTime() }, 'en')).toBe(
      new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' }).format(when),
    );
  });

  it('formats times with the short style', () => {
    expect(formatIcu('{d, time, short}', { d: when }, 'de')).toBe(
      new Intl.DateTimeFormat('de', { hour: 'numeric', minute: 'numeric' }).format(when),
    );
  });
});

describe('ICU rich text and escaping', () => {
  // Messages are compiled with ignoreTag: tags are literal text. The React layer
  // never receives element callbacks from the ICU path, and HTML-ish markup in a
  // translation must render as authored instead of being dropped or parsed.
  it('keeps tags as literal text around formatted arguments', () => {
    expect(
      formatIcu('<b>{n, plural, one {# file} other {# files}}</b> in <link>{folder}</link>', { n: 3, folder: 'Docs' }, 'en'),
    ).toBe('<b>3 files</b> in <link>Docs</link>');
  });

  it('does not treat a lone < as a parse error', () => {
    expect(formatIcu('{a} < {b}', { a: 1, b: 2 }, 'en')).toBe('1 < 2');
  });

  it('honours ICU apostrophe escaping', () => {
    expect(formatIcu("It''s {name}", { name: 'Kim' }, 'en')).toBe("It's Kim");
    expect(formatIcu("Use '{braces}' literally", {}, 'en')).toBe('Use {braces} literally');
    // `#` is only syntax inside a plural, so quoting it outside one keeps the apostrophes.
    expect(formatIcu("'#' {n, plural, other {# '#'}}", { n: 2 }, 'en')).toBe("'#' 2 #");
  });

  it('falls back to simple interpolation for a missing argument rather than throwing', () => {
    expect(formatIcu('Hello {name}', {}, 'en')).toBe('Hello {name}');
  });
});

describe('published catalog formatting', () => {
  it('formats an ICU entry after a JSON round trip, as the CDN serves it', () => {
    const { payloads } = compileCatalogs(
      [
        {
          key: 'files.count',
          namespace: 'files',
          kind: 'ui',
          format: 'icu',
          sourceText: '{n, plural, one {# file} other {# files}}',
          units: {
            pl: {
              language: 'pl',
              text: '{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}',
              state: 'reviewed',
            },
          },
        } as TranslationEntryRecord,
      ],
      { languages: ['en', 'pl'], defaultLanguage: 'en' },
    );
    const served = JSON.parse(JSON.stringify(payloads));
    expect(served.pl['files.count']).toEqual({
      message: '{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}',
      format: 'icu',
    });
    expect(translate(served.pl, 'files.count', undefined, { n: 3 }, 'simple', 'pl')).toBe('3 pliki');
    expect(translate(served.pl, 'files.count', undefined, { n: 5 }, 'simple', 'pl')).toBe('5 plików');
    expect(translate(served.en, 'files.count', undefined, { n: 1 }, 'simple', 'en')).toBe('1 file');
  });
});
