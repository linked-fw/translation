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
});

describe('formatIcu (minimal plural)', () => {
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
});

describe('directionFor', () => {
  it('marks ar/ur as rtl, others ltr', () => {
    expect(directionFor('ar')).toBe('rtl');
    expect(directionFor('ur')).toBe('rtl');
    expect(directionFor('en')).toBe('ltr');
    expect(directionFor('zh-Hans')).toBe('ltr');
  });
});
