import { describe, expect, it } from 'vitest';
import { createTranslationExchangeDocument } from '../src/export.js';
import type { TranslationEntryRecord } from '../src/records.js';

function entry(
  key: string,
  namespace: string,
  units: TranslationEntryRecord['units'],
  extra: Partial<TranslationEntryRecord> = {},
): TranslationEntryRecord {
  const version = {
    id: `urn:version:${key}`,
    versionId: `version-${key}`,
    sourceLanguage: 'en',
    sourceText: `Source ${key}`,
    format: 'simple' as const,
    argumentSignature: '[]',
    contractHash: `contract-${key}`,
    sourceHash: `source-${key}`,
  };
  return {
    key,
    namespace,
    sourceText: version.sourceText,
    kind: 'ui',
    format: 'simple',
    currentVersion: version,
    versions: [version],
    units,
    ...extra,
  };
}

describe('translation exchange export', () => {
  it('filters namespaces, languages, states and keys deterministically', async () => {
    const entries = [
      entry('z.last', 'other', {
        es: { language: 'es', text: 'Último', state: 'reviewed' },
      }),
      entry('common.save', 'common', {
        fr: { language: 'fr', text: 'Enregistrer', state: 'machine' },
        es: { language: 'es', text: 'Guardar', state: 'reviewed' },
      }),
      entry('common.cancel', 'common', {
        es: { language: 'es', text: 'Cancelar', state: 'stale' },
      }),
    ];
    const options = {
      appId: 'app-1',
      branchId: 'main',
      sourceLanguage: 'en',
      revisionWatermark: 'revision-10',
      namespaces: ['common'],
      keys: ['common.save'],
      languages: ['es'],
      states: ['reviewed' as const],
    };
    const first = await createTranslationExchangeDocument(entries, options);
    const second = await createTranslationExchangeDocument(
      [...entries].reverse(),
      options,
    );
    expect(first.document.entries).toHaveLength(1);
    expect(first.document.entries[0]).toMatchObject({
      key: 'common.save',
      translations: {
        es: { text: 'Guardar', state: 'reviewed' },
      },
    });
    expect(first.document.targetLanguages).toEqual(['es']);
    expect(first.documentHash).toBe(second.documentHash);
  });

  it('reports content and versionless records rather than silently dropping metadata', async () => {
    const content = entry(
      'article.title',
      'content',
      {},
      { kind: 'content' },
    );
    const versionless: TranslationEntryRecord = {
      key: 'legacy.key',
      namespace: 'legacy',
      sourceText: 'Legacy',
      kind: 'ui',
      format: 'simple',
      units: {},
    };
    const result = await createTranslationExchangeDocument(
      [content, versionless],
      {
        sourceLanguage: 'en',
        revisionWatermark: 'revision-10',
      },
    );
    expect(result.document.entries).toEqual([]);
    expect(result.findings.map(({ code }) => code)).toEqual([
      'content-key-unsupported',
      'missing-current-version',
    ]);
  });

  it('marks shape/package-owned keys as semantic exchange entries', async () => {
    const result = await createTranslationExchangeDocument(
      [
        entry(
          'person.name',
          'shape',
          { es: { language: 'es', text: 'Nombre', state: 'reviewed' } },
          { ofShape: 'schema:Person' },
        ),
      ],
      {
        sourceLanguage: 'en',
        revisionWatermark: 'revision-10',
      },
    );
    expect(result.document.entries[0].kind).toBe('semantic');
  });
});
