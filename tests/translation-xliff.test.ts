import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  xliff12Adapter,
  xliff20Adapter,
  type XliffFinding,
} from '../src/formats/xliff.js';
import type {
  ParsedTranslationExchangeDocument,
  TranslationExchangeDocument,
} from '../src/exchange.js';

const sourceHash = 'a'.repeat(64);
const contractHash = 'b'.repeat(64);

const fixture = (name: string) =>
  readFile(resolve(process.cwd(), 'tests', 'fixtures', 'xliff', name));

function canonicalDocument(): TranslationExchangeDocument {
  return {
    schemaVersion: 1,
    appId: 'https://example.test/apps/serve',
    branchId: 'change-17',
    sourceLanguage: 'en-US',
    targetLanguages: ['es', 'pt-BR'],
    exportedAt: '2026-07-29T12:00:00.000Z',
    revisionWatermark: 'revision-42',
    contractSetHash: 'c'.repeat(64),
    entries: [
      {
        key: 'navigation.home',
        namespace: 'shell',
        kind: 'ui',
        sourceText: 'Home',
        keyVersionId: 'https://example.test/keys/navigation.home/versions/1',
        sourceHash,
        contractHash,
        argumentSignature: '[]',
        description: 'Shown in the primary navigation.',
        format: 'simple',
        translations: {
          es: {
            text: 'Inicio',
            state: 'reviewed',
            note: 'Approved by the navigation reviewer.',
          },
          'pt-BR': {
            text: 'Início',
            state: 'machine',
          },
        },
      },
      {
        key: 'mission.members',
        namespace: 'mission',
        kind: 'semantic',
        sourceText:
          '{count, plural, =0 {No members} one {{owner} and one member} other {{owner} and # members}}',
        keyVersionId: 'https://example.test/keys/mission.members/versions/4',
        sourceHash: 'd'.repeat(64),
        contractHash: 'e'.repeat(64),
        argumentSignature: '[["count",["plural"]],["owner",["argument"]]]',
        description: 'Nested ICU plural used on mission cards.',
        format: 'icu',
        translations: {
          es: {
            text:
              '{count, plural, =0 {Sin miembros} one {{owner} y un miembro} other {{owner} y # miembros}}',
            state: 'stale',
          },
          'pt-BR': {
            text:
              '{count, plural, =0 {Nenhum membro} one {{owner} e um membro} other {{owner} e # membros}}',
            state: 'untranslated',
          },
        },
      },
    ],
  };
}

function expectCanonicalRoundTrip(
  actual: ParsedTranslationExchangeDocument,
): void {
  expect(actual).toEqual(canonicalDocument());
}

function withEvidence(
  parsed: ParsedTranslationExchangeDocument,
): TranslationExchangeDocument {
  return {
    ...parsed,
    entries: parsed.entries.map((entry, index) => ({
      ...entry,
      sourceText: entry.sourceText ?? '',
      keyVersionId: `https://example.test/foreign/${index}/version/1`,
      sourceHash,
      contractHash,
      argumentSignature: '[]',
    })),
  };
}

describe('XLIFF exchange adapters', () => {
  it('round-trips XLIFF 1.2 with simple and nested ICU keys', async () => {
    const serialized = await xliff12Adapter.serialize(canonicalDocument());
    expect(serialized.fileName).toBe('translations.xlf');
    expect(serialized.mediaType).toBe('application/xliff+xml');
    expect(xliff12Adapter.sniff(serialized.body, serialized.fileName)).toBe(true);

    expectCanonicalRoundTrip(await xliff12Adapter.parse(serialized.body));
  });

  it('round-trips XLIFF 2.0 with deterministic IDs and target states', async () => {
    const first = await xliff20Adapter.serialize(canonicalDocument());
    const second = await xliff20Adapter.serialize(canonicalDocument());
    expect(new TextDecoder().decode(first.body)).toBe(
      new TextDecoder().decode(second.body),
    );
    expect(new TextDecoder().decode(first.body)).toContain(
      'id="u1-shell_3Anavigation.home"',
    );

    expectCanonicalRoundTrip(await xliff20Adapter.parse(first.body));
  });

  it('does not invent empty translation records for missing targets', async () => {
    const document = canonicalDocument();
    delete document.entries[1].translations['pt-BR'];

    const parsed12 = await xliff12Adapter.parse(
      (await xliff12Adapter.serialize(document)).body,
    );
    const parsed20 = await xliff20Adapter.parse(
      (await xliff20Adapter.serialize(document)).body,
    );

    expect(parsed12.entries[1].translations['pt-BR']).toBeUndefined();
    expect(parsed20.entries[1].translations['pt-BR']).toBeUndefined();
  });

  it.each([
    ['memoQ', 'memoq-inline-1.2.xlf'],
    ['Trados', 'trados-inline-1.2.xlf'],
  ])('preserves %s-style inline IDs and surrounding text', async (_, name) => {
    const parsed = await xliff12Adapter.parse(await fixture(name));
    const sourceBefore = parsed.entries[0].sourceText;
    const targetBefore = Object.values(parsed.entries[0].translations)[0].text;
    const serialized = await xliff12Adapter.serialize(withEvidence(parsed));
    const reparsed = await xliff12Adapter.parse(serialized.body);

    expect(reparsed.entries[0].sourceText).toBe(sourceBefore);
    expect(Object.values(reparsed.entries[0].translations)[0].text).toBe(
      targetBefore,
    );
    expect(sourceBefore).toMatch(/\bid="(?:1|10)"/);
    expect(sourceBefore).toMatch(/\bid="(?:2|11)"/);
  });

  it('reports unsupported inline elements without flattening them', async () => {
    const findings: XliffFinding[] = [];
    const input = new TextEncoder().encode(`<?xml version="1.0"?>
      <xliff version="1.2">
        <file source-language="en" target-language="es"><body>
          <trans-unit id="custom"><source>Keep <custom id="7">this</custom>.</source><target>Conserva esto.</target></trans-unit>
        </body></file>
      </xliff>`);
    const parsed = await xliff12Adapter.parse(input, {
      onFinding: (finding: XliffFinding) => findings.push(finding),
    });

    expect(parsed.entries[0].sourceText).toBe(
      'Keep <custom id="7">this</custom>.',
    );
    expect(findings).toEqual([
      expect.objectContaining({
        code: 'unsupported-inline',
        element: 'custom',
        unitId: 'custom',
      }),
    ]);
  });

  it('rejects DTD/XXE input before entity resolution', async () => {
    await expect(
      xliff12Adapter.parse(await fixture('xxe-1.2.xlf')),
    ).rejects.toThrow('DTD or entity declaration is not allowed');
  });

  it('parses foreign XLIFF without inventing Create Now evidence', async () => {
    const parsed = await xliff20Adapter.parse(await fixture('foreign-2.0.xlf'));

    expect(parsed.sourceLanguage).toBe('en');
    expect(parsed.targetLanguages).toEqual(['es']);
    expect(parsed.entries[0]).toMatchObject({
      key: 'navigation.home',
      sourceText: 'Home',
      translations: {
        es: {
          text: 'Inicio',
          state: 'machine',
        },
      },
    });
    expect(parsed.entries[0].keyVersionId).toBeUndefined();
    expect(parsed.entries[0].sourceHash).toBeUndefined();
    expect(parsed.entries[0].contractHash).toBeUndefined();
    expect(parsed.entries[0].argumentSignature).toBeUndefined();
  });
});
