import { describe, expect, it } from 'vitest';
import {
  compileCatalogs,
  compileLanguage,
  hashPayload,
  hashString,
  payloadFileName,
  stableStringify,
} from '../src/compile.js';
import type { TranslationEntryRecord } from '../src/records.js';

function entry(
  key: string,
  sourceText: string,
  units: Record<string, { text: string; state: any }> = {},
  kind: 'ui' | 'content' = 'ui',
): TranslationEntryRecord {
  return {
    key,
    namespace: key.split('.').slice(0, -1).join('.'),
    sourceText,
    kind,
    format: 'simple',
    units: Object.fromEntries(
      Object.entries(units).map(([l, u]) => [l, { language: l, text: u.text, state: u.state }]),
    ),
  };
}

const entries: TranslationEntryRecord[] = [
  entry('nav.alerts', 'Alerts', {
    es: { text: 'Alertas', state: 'reviewed' },
    de: { text: 'Warnungen (roh)', state: 'machine' },
  }),
  entry('common.save', 'Save', { es: { text: 'Guardar', state: 'reviewed' } }),
  entry('graph.only', 'Graph content', { es: { text: 'x', state: 'reviewed' } }, 'content'),
];

describe('compileLanguage', () => {
  it('source language emits sourceText for every ui key (content excluded)', () => {
    expect(compileLanguage(entries, 'en', { defaultLanguage: 'en' })).toEqual({
      'nav.alerts': 'Alerts',
      'common.save': 'Save',
    });
  });

  it('machine-ok ships any unit text, English fallback for missing', () => {
    expect(compileLanguage(entries, 'de', { defaultLanguage: 'en' })).toEqual({
      'nav.alerts': 'Warnungen (roh)', // machine draft shipped
      'common.save': 'Save', // no de unit → English fallback
    });
  });

  it('reviewed-only ships reviewed values, falls back to English for unreviewed', () => {
    expect(
      compileLanguage(entries, 'de', { defaultLanguage: 'en', reviewedOnly: true }),
    ).toEqual({
      'nav.alerts': 'Alerts', // de is machine → withheld → English
      'common.save': 'Save',
    });
    expect(
      compileLanguage(entries, 'es', { defaultLanguage: 'en', reviewedOnly: true }),
    ).toEqual({
      'nav.alerts': 'Alertas', // reviewed → shipped
      'common.save': 'Guardar',
    });
  });

  it('excludes kind:content keys entirely (AD-I)', () => {
    const es = compileLanguage(entries, 'es', { defaultLanguage: 'en' });
    expect(es['graph.only']).toBeUndefined();
  });

  it('retains per-key ICU metadata in mixed runtime payloads', () => {
    const icu = entry(
      'mission.count',
      '{n, plural, one {# mission} other {# missions}}',
      {
        es: {
          text: '{n, plural, one {# misión} other {# misiones}}',
          state: 'reviewed',
        },
      },
    );
    icu.format = 'icu';
    expect(
      compileLanguage([entries[0], icu], 'es', { defaultLanguage: 'en' }),
    ).toEqual({
      'nav.alerts': 'Alertas',
      'mission.count': {
        message: '{n, plural, one {# misión} other {# misiones}}',
        format: 'icu',
      },
    });
  });
});

describe('hashing', () => {
  it('is deterministic and order-independent', () => {
    expect(stableStringify({ b: '2', a: '1' })).toBe('{"a":"1","b":"2"}');
    expect(hashPayload({ a: '1', b: '2' })).toBe(hashPayload({ b: '2', a: '1' }));
  });
  it('changes when content changes', () => {
    expect(hashPayload({ a: '1' })).not.toBe(hashPayload({ a: '2' }));
    expect(hashString('x')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('compileCatalogs', () => {
  it('compiles requested languages with per-language hash/dir/count + manifest', () => {
    const { payloads, manifest } = compileCatalogs(entries, {
      languages: ['en', 'es', 'ar'],
      defaultLanguage: 'en',
      reviewedOnlyLanguages: ['de'],
      generatedAt: '2026-07-22T00:00:00Z',
    });
    expect(Object.keys(payloads)).toEqual(['en', 'es', 'ar']);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.defaultLanguage).toBe('en');
    expect(manifest.generatedAt).toBe('2026-07-22T00:00:00Z');
    expect(manifest.languages.ar.dir).toBe('rtl');
    expect(manifest.languages.es.dir).toBe('ltr');
    expect(manifest.languages.en.count).toBe(2); // 2 ui keys
    expect(manifest.languages.es.hash).toBe(hashPayload(payloads.es));
  });

  it('omits generatedAt for deterministic output when not provided', () => {
    const a = compileCatalogs(entries, { languages: ['es'], defaultLanguage: 'en' });
    const b = compileCatalogs(entries, { languages: ['es'], defaultLanguage: 'en' });
    expect(a.manifest.generatedAt).toBeUndefined();
    expect(a.manifest.languages.es.hash).toBe(b.manifest.languages.es.hash);
  });
});

describe('payloadFileName', () => {
  it('simple vs hashed', () => {
    expect(payloadFileName('es', 'abc123')).toBe('es.json');
    expect(payloadFileName('es', 'abc123', { hashed: true })).toBe('es.abc123.json');
  });
});
