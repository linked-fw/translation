import { describe, expect, it } from 'vitest';
import {
  commitVersionedImport,
  flattenMessages,
  hasIcuSyntax,
  planVersionedImport,
  runImport,
  tolgeeCdnSource,
  translationUnitContentHash,
  type ImportTarget,
  type ParsedUnit,
  type TranslationImportSource,
  type VersionedImportTarget,
} from '../src/import.js';
import type { TranslationEntryRecord } from '../src/records.js';

function fakeSource(units: ParsedUnit[]): TranslationImportSource {
  return { name: 'fake', load: async () => units };
}

function fakeTarget(
  keys: Array<{ key: string; sourceText: string; format?: string }>,
  units: Array<{ key: string; language: string }> = [],
) {
  const writes: Array<{ key: string; language: string; text: string; state: string }> = [];
  const target: ImportTarget = {
    listKeys: async () => keys,
    listUnits: async () => units,
    upsertUnit: async (d) => {
      writes.push(d);
    },
  };
  return { target, writes };
}

describe('flattenMessages', () => {
  it('flattens nested Tolgee JSON to dot-keys', () => {
    expect(flattenMessages({ account: { baseline: 'New photo saved.' }, a: { b: { c: 'x' } } })).toEqual(
      { 'account.baseline': 'New photo saved.', 'a.b.c': 'x' },
    );
  });
  it('keeps already-flat dotted keys', () => {
    expect(flattenMessages({ 'nav.notifications': 'Alerts' })).toEqual({
      'nav.notifications': 'Alerts',
    });
  });
});

describe('hasIcuSyntax', () => {
  it('detects plural/select', () => {
    expect(hasIcuSyntax('{count, plural, one {# item} other {# items}}')).toBe(true);
    expect(hasIcuSyntax('{gender, select, male {he} other {they}}')).toBe(true);
  });
  it('passes simple interpolation', () => {
    expect(hasIcuSyntax('Hello {name}')).toBe(false);
    expect(hasIcuSyntax('Block {name}')).toBe(false);
  });
});

describe('runImport', () => {
  const keys = [
    { key: 'nav.alerts', sourceText: 'Alerts', format: 'simple' },
    { key: 'common.save', sourceText: 'Save', format: 'simple' },
  ];

  it('imports non-source units, skips the source language, reports coverage', async () => {
    const { target, writes } = fakeTarget(keys);
    const report = await runImport(
      target,
      fakeSource([
        { language: 'en', key: 'nav.alerts', text: 'Alerts' }, // source → not written
        { language: 'es', key: 'nav.alerts', text: 'Alertas' },
        { language: 'es', key: 'common.save', text: 'Guardar' },
        { language: 'es', key: 'ghost.key', text: 'Fantasma' }, // orphan
      ]),
    );
    expect(writes).toEqual([
      { key: 'nav.alerts', language: 'es', text: 'Alertas', state: 'reviewed' },
      { key: 'common.save', language: 'es', text: 'Guardar', state: 'reviewed' },
    ]);
    expect(report.created).toBe(2);
    expect(report.languages).toEqual(['en', 'es']);
    expect(report.orphanKeys).toEqual(['ghost.key']);
    expect(report.uncoveredKeys).toEqual([]); // both keys covered (via en + es)
    expect(report.perLanguage.es.created).toBe(2);
  });

  it('skip-existing (default) leaves existing units, overwrite replaces them', async () => {
    const existing = [{ key: 'nav.alerts', language: 'es' }];
    const src = () => fakeSource([{ language: 'es', key: 'nav.alerts', text: 'Alertas' }]);

    const skip = fakeTarget(keys, existing);
    const r1 = await runImport(skip.target, src());
    expect(skip.writes).toEqual([]);
    expect(r1.skippedExisting).toBe(1);
    expect(r1.created).toBe(0);

    const over = fakeTarget(keys, existing);
    const r2 = await runImport(over.target, src(), { mergePolicy: 'overwrite' });
    expect(over.writes).toHaveLength(1);
    expect(r2.updated).toBe(1);
  });

  it('import-as-stale writes state stale', async () => {
    const { target, writes } = fakeTarget(keys);
    await runImport(target, fakeSource([{ language: 'fr', key: 'common.save', text: 'Enregistrer' }]), {
      mergePolicy: 'import-as-stale',
    });
    expect(writes[0].state).toBe('stale');
  });

  it('reports source-language drift and uncovered keys', async () => {
    const { target } = fakeTarget(keys);
    const report = await runImport(
      target,
      fakeSource([
        { language: 'en', key: 'nav.alerts', text: 'Notifications' }, // differs from "Alerts"
        // common.save has no source translation anywhere → uncovered
      ]),
    );
    expect(report.sourceMismatches).toEqual([
      { key: 'nav.alerts', appSource: 'Alerts', importSource: 'Notifications' },
    ]);
    expect(report.uncoveredKeys).toEqual(['common.save']);
  });

  it('flags ICU syntax on a simple-format key and honors dryRun', async () => {
    const { target, writes } = fakeTarget([
      { key: 'items.count', sourceText: '{n} items', format: 'simple' },
    ]);
    const report = await runImport(
      target,
      fakeSource([
        { language: 'ru', key: 'items.count', text: '{n, plural, one {# элемент} other {# элементов}}' },
      ]),
      { dryRun: true },
    );
    expect(report.icuFlags).toEqual(['items.count']);
    expect(report.created).toBe(1); // counted…
    expect(writes).toEqual([]); //   …but nothing written on a dry run
  });
});

describe('tolgeeCdnSource', () => {
  it('fetches + flattens per language, skips a missing file', async () => {
    const files: Record<string, unknown> = {
      es: { nav: { alerts: 'Alertas' } },
      fr: { nav: { alerts: 'Alertes' } },
    };
    const fetchImpl = (async (url: string) => {
      const lang = url.split('/').pop()!.replace('.json', '');
      return lang in files
        ? { ok: true, json: async () => files[lang] }
        : { ok: false, json: async () => ({}) };
    }) as unknown as typeof fetch;

    const source = tolgeeCdnSource({
      baseUrl: 'https://cdn.example/hash/',
      languages: ['es', 'fr', 'de'],
      fetchImpl,
    });
    const units = await source.load();
    expect(units).toEqual([
      { language: 'es', key: 'nav.alerts', text: 'Alertas' },
      { language: 'fr', key: 'nav.alerts', text: 'Alertes' },
    ]); // de skipped (404)
  });
});

const currentVersion = {
  id: 'urn:version:save:2',
  versionId: '01SAVE2',
  sourceLanguage: 'en',
  sourceText: 'Save changes',
  format: 'simple' as const,
  argumentSignature: '[]',
  contractHash: 'contract-simple-empty',
  sourceHash: 'source-save-changes',
};

function versionedEntry(
  units: TranslationEntryRecord['units'] = {},
): TranslationEntryRecord {
  return {
    key: 'common.save',
    namespace: 'common',
    sourceText: currentVersion.sourceText,
    kind: 'ui',
    format: 'simple',
    currentVersion,
    versions: [currentVersion],
    units,
  };
}

function exchangeEntry(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    key: 'common.save',
    namespace: 'common',
    kind: 'ui',
    sourceText: currentVersion.sourceText,
    keyVersionId: currentVersion.id,
    sourceHash: currentVersion.sourceHash,
    contractHash: currentVersion.contractHash,
    argumentSignature: currentVersion.argumentSignature,
    format: currentVersion.format,
    translations: {
      es: { text: 'Guardar cambios', state: 'reviewed' },
    },
    ...overrides,
  };
}

function exchangeDocument(entry: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    sourceLanguage: 'en',
    targetLanguages: ['es'],
    entries: [entry],
  };
}

function versionedTarget(
  state: Array<{
    key: string;
    language: string;
    keyVersionId?: string;
    unitContentHash?: string;
  }>,
) {
  const units: unknown[] = [];
  const suggestions: unknown[] = [];
  const target: VersionedImportTarget = {
    readCurrentState: async () => state,
    upsertUnit: async (value) => {
      units.push(value);
    },
    createSuggestion: async (value) => {
      suggestions.push(value);
    },
  };
  return { target, units, suggestions };
}

describe('version-aware import', () => {
  it('writes an exact-version import through the shared versioned writer', async () => {
    const plan = await planVersionedImport(
      exchangeDocument(exchangeEntry()),
      [versionedEntry()],
      {
        sessionId: 'session-exact',
        revisionWatermark: 'revision-7',
        mergePolicy: 'overwrite',
      },
    );
    expect(plan.decisions[0]).toMatchObject({
      disposition: 'import',
      reason: 'exact-current-version',
      expectedKeyVersionId: currentVersion.id,
    });
    const { target, units, suggestions } = versionedTarget([
      {
        key: 'common.save',
        language: 'es',
        keyVersionId: currentVersion.id,
      },
    ]);
    const report = await commitVersionedImport(plan, target);
    expect(report).toMatchObject({
      status: 'committed',
      imported: 1,
      suggested: 0,
    });
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      key: 'common.save',
      keyVersionId: currentVersion.id,
      source: 'import',
    });
    expect(suggestions).toEqual([]);
  });

  it('turns a compatible source change into a carry-forward suggestion', async () => {
    const plan = await planVersionedImport(
      exchangeDocument(
        exchangeEntry({
          sourceText: 'Save',
          keyVersionId: 'urn:version:save:1',
          sourceHash: 'source-save',
        }),
      ),
      [versionedEntry()],
      {
        sessionId: 'session-carry',
        revisionWatermark: 'revision-7',
        mergePolicy: 'overwrite',
      },
    );
    expect(plan.decisions[0]).toMatchObject({
      disposition: 'carry-forward',
      basedOnText: currentVersion.sourceText,
    });
    const { target, units, suggestions } = versionedTarget([
      {
        key: 'common.save',
        language: 'es',
        keyVersionId: currentVersion.id,
      },
    ]);
    await commitVersionedImport(plan, target);
    expect(units).toEqual([]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ source: 'carry-forward' });
  });

  it('rejects incompatible argument contracts before persistence', async () => {
    const plan = await planVersionedImport(
      exchangeDocument(
        exchangeEntry({
          contractHash: 'different-contract',
          argumentSignature: '[["count",["plural"]]]',
        }),
      ),
      [versionedEntry()],
      {
        sessionId: 'session-conflict',
        revisionWatermark: 'revision-7',
      },
    );
    expect(plan.decisions[0].disposition).toBe('conflict');
    const { target, units, suggestions } = versionedTarget([]);
    await commitVersionedImport(plan, target);
    expect(units).toEqual([]);
    expect(suggestions).toEqual([]);
  });

  it('requires explicit manager binding for an unverified suggestion', async () => {
    const foreign = exchangeEntry({
      key: 'foreign.save',
      namespace: undefined,
      sourceText: undefined,
      keyVersionId: undefined,
      sourceHash: undefined,
      contractHash: undefined,
      argumentSignature: undefined,
    });
    const unbound = await planVersionedImport(
      exchangeDocument(foreign),
      [versionedEntry()],
      {
        sessionId: 'session-unbound',
        revisionWatermark: 'revision-7',
      },
    );
    expect(unbound.decisions[0]).toMatchObject({
      disposition: 'conflict',
      reason: 'orphan-key',
    });

    const bound = await planVersionedImport(
      exchangeDocument(foreign),
      [versionedEntry()],
      {
        sessionId: 'session-bound',
        revisionWatermark: 'revision-7',
        managerBindings: { 'foreign.save': 'common.save' },
      },
    );
    expect(bound.decisions[0]).toMatchObject({
      disposition: 'unverified-source',
      reason: 'manager-bound-unverified',
      basedOnText: currentVersion.sourceText,
    });
    const { target, units, suggestions } = versionedTarget([
      {
        key: 'common.save',
        language: 'es',
        keyVersionId: currentVersion.id,
      },
    ]);
    await commitVersionedImport(bound, target);
    expect(units).toEqual([]);
    expect(suggestions).toHaveLength(1);
  });

  it('applies merge policy only after exact version classification', async () => {
    const existing = {
      language: 'es',
      text: 'Guardar',
      state: 'reviewed' as const,
      keyVersionId: currentVersion.id,
    };
    const expectedUnitContentHash = await translationUnitContentHash(existing);
    const skip = await planVersionedImport(
      exchangeDocument(exchangeEntry()),
      [versionedEntry({ es: existing })],
      {
        sessionId: 'session-skip',
        revisionWatermark: 'revision-7',
      },
    );
    expect(skip.decisions[0].disposition).toBe('skip');

    const stale = await planVersionedImport(
      exchangeDocument(exchangeEntry()),
      [versionedEntry({ es: existing })],
      {
        sessionId: 'session-stale',
        revisionWatermark: 'revision-7',
        mergePolicy: 'import-as-stale',
      },
    );
    expect(stale.decisions[0]).toMatchObject({
      disposition: 'import',
      state: 'stale',
      expectedUnitContentHash,
    });
  });

  it('aborts the batch before writes when the dry-run watermark state drifts', async () => {
    const plan = await planVersionedImport(
      exchangeDocument(exchangeEntry()),
      [versionedEntry()],
      {
        sessionId: 'session-drift',
        revisionWatermark: 'revision-7',
        mergePolicy: 'overwrite',
      },
    );
    const { target, units, suggestions } = versionedTarget([
      {
        key: 'common.save',
        language: 'es',
        keyVersionId: 'urn:version:save:3',
      },
    ]);
    const report = await commitVersionedImport(plan, target);
    expect(report.status).toBe('requires-redry-run');
    expect(units).toEqual([]);
    expect(suggestions).toEqual([]);
  });

  it('skips idempotency keys completed by an earlier retry', async () => {
    const plan = await planVersionedImport(
      exchangeDocument(exchangeEntry()),
      [versionedEntry()],
      {
        sessionId: 'session-retry',
        revisionWatermark: 'revision-7',
        mergePolicy: 'overwrite',
      },
    );
    const done = plan.decisions[0].idempotencyKey;
    const { target, units } = versionedTarget([]);
    const report = await commitVersionedImport(plan, target, {
      completedIdempotencyKeys: new Set([done]),
    });
    expect(report.status).toBe('committed');
    expect(report.imported).toBe(0);
    expect(units).toEqual([]);
  });
});
