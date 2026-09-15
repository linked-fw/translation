import { describe, expect, it } from 'vitest';
import {
  directionFor,
  formatIcu,
  interpolate,
  translate,
} from '@_linked/translation/core/messages';

// Framework-light translation core (Plan 014 P1.5) — the Tolgee-compatible
// t()/interpolation heart. Proven without a browser.

describe('interpolate (FormatSimple)', () => {
  it('substitutes named placeholders', () => {
    expect(interpolate('Welcome, {name}', { name: 'Ana' })).toBe('Welcome, Ana');
  });
  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('Hi {name} {missing}', { name: 'Ana' })).toBe('Hi Ana {missing}');
  });
  it('is a no-op without params', () => {
    expect(interpolate('plain text')).toBe('plain text');
  });
  it('tolerates whitespace in braces', () => {
    expect(interpolate('{ name }!', { name: 'x' })).toBe('x!');
  });
  it('supports positional, dotted, hyphenated, and Unicode variable names', () => {
    expect(
      interpolate('{0} · {user.name} · {item-count} · {名前}', {
        0: 'first',
        'user.name': 'Ana',
        'item-count': 3,
        名前: '愛',
      }),
    ).toBe('first · Ana · 3 · 愛');
  });
});

describe('formatIcu', () => {
  it('picks the one/other category by English cardinal rule', () => {
    const t = '{count, plural, one {# item} other {# items}}';
    expect(formatIcu(t, { count: 1 })).toBe('1 item');
    expect(formatIcu(t, { count: 3 })).toBe('3 items');
    expect(formatIcu(t, { count: 0 })).toBe('0 items');
  });
  it('honors explicit =N cases', () => {
    const t = '{count, plural, =0 {none} one {# thing} other {# things}}';
    expect(formatIcu(t, { count: 0 })).toBe('none');
    expect(formatIcu(t, { count: 1 })).toBe('1 thing');
  });
  it('still interpolates named params around the plural', () => {
    const t = '{name}: {count, plural, one {# msg} other {# msgs}}';
    expect(formatIcu(t, { name: 'Ana', count: 2 })).toBe('Ana: 2 msgs');
  });
  it('uses the active locale plural categories', () => {
    const russian =
      '{n, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}';
    expect(formatIcu(russian, { n: 1 }, 'ru')).toBe('1 файл');
    expect(formatIcu(russian, { n: 2 }, 'ru')).toBe('2 файла');
    expect(formatIcu(russian, { n: 5 }, 'ru')).toBe('5 файлов');
  });
  it('supports nested select and plural messages', () => {
    const message =
      '{gender, select, female {{n, plural, one {She has # task} other {She has # tasks}}} other {{n, plural, one {They have # task} other {They have # tasks}}}}';
    expect(formatIcu(message, { gender: 'female', n: 2 }, 'en')).toBe(
      'She has 2 tasks',
    );
  });
  it('supports selectordinal and locale-aware number formatting', () => {
    const ordinal =
      '{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}';
    expect(formatIcu(ordinal, { place: 22 }, 'en')).toBe('22nd');
    expect(formatIcu('Total: {total, number}', { total: 1234 }, 'en')).toBe(
      'Total: 1,234',
    );
  });
  it('leaves invalid ICU visible instead of crashing the host app', () => {
    expect(formatIcu('{n, plural, one {one}}', { n: 2 }, 'en')).toBe(
      '{n, plural, one {one}}',
    );
  });
});

describe('translate (t)', () => {
  const messages = { 'today.welcome': 'Bienvenido, {name}' };
  it('uses the message map when the key exists', () => {
    expect(translate(messages, 'today.welcome', 'Welcome, {name}', { name: 'Ana' })).toBe(
      'Bienvenido, Ana',
    );
  });
  it('falls back to the inline default when the key is missing', () => {
    expect(translate(messages, 'missing.key', 'Fallback {x}', { x: 'y' })).toBe('Fallback y');
  });
  it('falls back to the key itself with no default', () => {
    expect(translate(messages, 'no.default')).toBe('no.default');
  });
  it('applies ICU only for format:icu', () => {
    const m = { plural: '{n, plural, one {# cat} other {# cats}}' };
    expect(translate(m, 'plural', undefined, { n: 2 }, 'icu')).toBe('2 cats');
    // simple format leaves the ICU syntax untouched (no accidental reinterpretation)
    expect(translate(m, 'plural', undefined, { n: 2 }, 'simple')).toContain('plural');
  });
  it('honors per-key format metadata in a mixed catalog', () => {
    const m = {
      plain: 'Welcome, {name}',
      count: {
        message: '{n, plural, one {# mission} other {# missions}}',
        format: 'icu' as const,
      },
    };
    expect(translate(m, 'plain', undefined, { name: 'Ana' }, 'simple', 'en')).toBe(
      'Welcome, Ana',
    );
    expect(translate(m, 'count', undefined, { n: 2 }, 'simple', 'en')).toBe(
      '2 missions',
    );
  });
});

describe('directionFor', () => {
  it('marks ar/ur as rtl, others ltr', () => {
    expect(directionFor('ar')).toBe('rtl');
    expect(directionFor('ur')).toBe('rtl');
    expect(directionFor('en')).toBe('ltr');
    expect(directionFor('zh-Hans')).toBe('ltr');
  });
});
