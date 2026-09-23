import { describe, expect, it } from 'vitest';
import {
  containsTerm,
  findingsByKey,
  harvestTermCandidates,
  runChecks,
  termbaseViolations,
  violatesTermbase,
} from '../src/checks.js';
import type { GlossaryTermRecord } from '../src/records.js';

const term = (over: Partial<GlossaryTermRecord>): GlossaryTermRecord => ({
  id: 'g1',
  term: 'Serve',
  termType: 'keep',
  ...over,
});

describe('harvestTermCandidates', () => {
  it('suggests repeated and untranslated proper terms without duplicating the termbase', () => {
    const candidates = harvestTermCandidates(
      [
        entry('a', 'Join Serve with Unity', {
          es: { text: 'Únete a Serve con Unidad', state: 'reviewed' },
        }),
        entry('b', 'Support Serve and Unity', {
          es: { text: 'Apoya Serve y Unidad', state: 'reviewed' },
        }),
        entry('c', 'Practice Unity today', {
          es: { text: 'Practica Unidad hoy', state: 'reviewed' },
        }),
      ] as any,
      ['es'],
      [term({ term: 'Unity', termType: 'prefer' })],
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        term: 'Serve',
        suggestedType: 'keep',
        reasons: expect.arrayContaining(['capitalized', 'untranslated']),
        languages: ['es'],
      }),
    ]);
    expect(candidates.some(({ term }) => term === 'Unity')).toBe(false);
  });

  it('suggests a repeated ordinary source term for preferred translation', () => {
    const candidates = harvestTermCandidates(
      [
        entry('a', 'A mission begins', {}),
        entry('b', 'Choose a mission', {}),
        entry('c', 'Complete the mission', {}),
      ] as any,
      ['es'],
    );

    expect(candidates).toContainEqual(
      expect.objectContaining({
        term: 'mission',
        occurrences: 3,
        suggestedType: 'prefer',
        reasons: ['repeated'],
      }),
    );
  });
});

const entry = (
  key: string,
  sourceText: string,
  units: Record<string, { text: string; state: string }>,
  format: 'simple' | 'icu' = 'simple',
) => ({ key, namespace: key.split('.')[0], sourceText, units, format });

describe('containsTerm', () => {
  it('matches whole words, unicode-aware, case-insensitive by default', () => {
    expect(containsTerm('Join Serve today', 'Serve')).toBe(true);
    expect(containsTerm('Observers only', 'Serve')).toBe(false); // substring
    expect(containsTerm('join serve today', 'Serve')).toBe(true);
    expect(containsTerm('join serve today', 'Serve', true)).toBe(false);
    expect(containsTerm('¡Únete a Misión!', 'Misión')).toBe(true);
  });
});

describe('termbaseViolations', () => {
  it('keep: the term must survive verbatim with exact casing', () => {
    const tb = [term({ termType: 'keep', caseSensitive: true })];
    expect(termbaseViolations('Welcome to Serve', 'Willkommen bei Serve', tb, 'de')).toEqual([]);
    const bad = termbaseViolations('Welcome to Serve', 'Willkommen bei serve', tb, 'de');
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({ rule: 'term-keep', severity: 'error', suggestion: 'Serve' });
  });

  it('forbid: flags banned words/spellings with the replacement', () => {
    const tb = [
      term({ term: 'organisation', termType: 'forbid', useInstead: 'organization', language: 'en' }),
    ];
    const bad = termbaseViolations('The organization', 'The organisation', tb, 'en');
    expect(bad[0]).toMatchObject({
      rule: 'term-forbid',
      severity: 'error',
      suggestion: 'organization',
    });
    // Different language — the en-scoped rule does not apply.
    expect(termbaseViolations('x', 'organisation', tb, 'de')).toEqual([]);
  });

  it('prefer: advisory warning when the preferred wording is missing', () => {
    const tb = [term({ term: 'mission', termType: 'prefer', translation: 'misión', language: 'es' })];
    const bad = termbaseViolations('Your mission', 'Tu tarea', tb, 'es');
    expect(bad[0]).toMatchObject({ rule: 'term-prefer', severity: 'warning', suggestion: 'misión' });
    expect(termbaseViolations('Your mission', 'Tu misión', tb, 'es')).toEqual([]);
  });

  it('violatesTermbase gates only on error severity', () => {
    const prefer = [term({ term: 'mission', termType: 'prefer', translation: 'misión' })];
    expect(violatesTermbase('mission', 'tarea', prefer, 'es')).toBe(false);
    const keep = [term({ termType: 'keep' })];
    expect(violatesTermbase('Serve', 'Sirve', keep, 'es')).toBe(true);
  });
});

describe('runChecks', () => {
  it('combines placeholder, termbase, and divergence findings per key', () => {
    const findings = runChecks(
      [
        entry('a.greet', 'Hi {name}', { es: { text: 'Hola {nombre}', state: 'reviewed' } }),
        entry('b.save', 'Save', { es: { text: 'Guardar', state: 'reviewed' } }),
        entry('c.save', 'Save', { es: { text: 'Guardar', state: 'reviewed' } }),
        entry('d.save', 'Save', { es: { text: 'Salvar', state: 'reviewed' } }),
      ],
      'es',
      [term({ termType: 'keep', caseSensitive: true })],
    );
    const rules = findings.map((f) => `${f.key}:${f.rule}`);
    expect(rules).toContain('a.greet:placeholder-integrity');
    // Minority variant flagged with the majority as the suggestion.
    const divergence = findings.find((f) => f.rule === 'source-divergence');
    expect(divergence).toMatchObject({ key: 'd.save', suggestion: 'Guardar' });
    // Majority keys are NOT flagged.
    expect(rules.filter((r) => r.endsWith('source-divergence'))).toEqual([
      'd.save:source-divergence',
    ]);
    const grouped = findingsByKey(findings);
    expect(grouped.get('a.greet')).toHaveLength(1);
  });

  it('is silent on clean content', () => {
    expect(
      runChecks(
        [entry('a', 'Hi {name}', { es: { text: 'Hola {name}', state: 'reviewed' } })],
        'es',
        [],
      ),
    ).toEqual([]);
  });

  it('treats legacy {s} as a plural migration warning, not a required variable', () => {
    const findings = runChecks(
      [
        entry('mission.count', '{n} mission{s}', {
          es: { text: '{n} misión', state: 'reviewed' },
        }),
      ],
      'es',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: 'legacy-plural-suffix',
      severity: 'warning',
    });
  });

  it('reports invalid ICU and argument role changes precisely', () => {
    const invalid = runChecks(
      [
        entry(
          'mission.count',
          '{n, plural, one {# mission} other {# missions}}',
          { es: { text: '{n, plural, one {# misión}}', state: 'reviewed' } },
          'icu',
        ),
      ],
      'es',
    );
    expect(invalid[0]).toMatchObject({
      rule: 'message-syntax',
      severity: 'error',
    });

    const changedRole = runChecks(
      [
        entry(
          'mission.count',
          '{n, plural, one {# mission} other {# missions}}',
          { es: { text: 'Hay {n} misiones', state: 'reviewed' } },
          'icu',
        ),
      ],
      'es',
    );
    expect(changedRole[0].message).toContain(
      '{n} changes from plural to argument',
    );
  });
});

describe('required concept terminology', () => {
  it('accepts Turkish capitalized practice names without merging the concepts', () => {
    const glossary = [
      term({ term: 'Oneness', termType: 'require', translation: 'Dayanışma', language: 'tr' }),
      term({ term: 'Unity', termType: 'require', translation: 'Birlik', language: 'tr' }),
    ];
    expect(termbaseViolations('Meeting 3: Oneness Action Meeting Guide',
      'TOPLANTI 3: DAYANIŞMA EYLEM TOPLANTISI REHBERİ', glossary, 'tr')).toEqual([]);
    expect(termbaseViolations('UNITY', 'BİRLİK', glossary, 'tr')).toEqual([]);
    expect(violatesTermbase('Oneness', 'BİRLİK', glossary, 'tr')).toBe(true);
    expect(containsTerm('DAYANIŞMA', 'Dayanışma', true, 'tr')).toBe(false);
  });

  it('keeps glossary checks usable for custom language identifiers', () => {
    expect(containsTerm('SOLIDARITY', 'Solidarity', false, 'x-custom')).toBe(true);
  });

  const concepts = [
    term({
      term: 'Oneness',
      termType: 'require',
      translation: 'Solidaridad',
      language: 'es',
    }),
    term({
      term: 'Unity',
      termType: 'require',
      translation: 'Unidad',
      language: 'es',
    }),
  ];
  it('requires the source-specific label without globally forbidding Unity', () => {
    expect(violatesTermbase('Oneness', 'Unidad', concepts, 'es')).toBe(true);
    expect(violatesTermbase('Unity', 'Unidad', concepts, 'es')).toBe(false);
    expect(
      violatesTermbase(
        'Oneness and Unity',
        'Solidaridad y Unidad',
        concepts,
        'es'
      )
    ).toBe(false);
    expect(
      violatesTermbase('Oneness and Unity', 'Unidad y Unidad', concepts, 'es')
    ).toBe(true);
    expect(
      termbaseViolations('Oneness', 'Unidad', concepts, 'es')[0]
    ).toMatchObject({ rule: 'term-required', severity: 'error' });
    expect(violatesTermbase('Oneness', 'Unité', concepts, 'fr')).toBe(false);
  });
  it('recognizes Chinese and Japanese concepts inside unspaced sentences', () => {
    const chinese = [
      term({
        term: 'Oneness',
        termType: 'require',
        translation: '合一',
        language: 'zh-Hans',
      }),
    ];
    expect(
      violatesTermbase(
        'Practice Oneness',
        '练习合一，创造和平。',
        chinese,
        'zh-Hans'
      )
    ).toBe(false);
    expect(
      violatesTermbase(
        'Practice Oneness',
        '练习团结，创造和平。',
        chinese,
        'zh-Hans'
      )
    ).toBe(true);
    expect(containsTerm('連帯を実践しましょう', '連帯')).toBe(true);
    expect(containsTerm('community', 'unity')).toBe(false);
  });
});
