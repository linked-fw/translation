import { describe, expect, it } from 'vitest';
import {
  applyCatalogPatches,
  canonicalJson,
  compileRelease,
  compileTranslationCompaction,
  compileTranslationHotfix,
  decodeReleaseObject,
  releaseReferencesKeyVersion,
  selectPrunableTranslationObjects,
  shouldCompactTranslationLanguage,
} from '../src/release.js';
import type { TranslationEntryRecord } from '../src/records.js';

const entries: TranslationEntryRecord[] = [
  {
    key: 'account.title',
    namespace: 'account',
    sourceText: 'Account',
    kind: 'ui',
    format: 'simple',
    currentVersion: {
      id: 'https://example.test/key/account.title/version/01',
      versionId: '01',
      sourceLanguage: 'en',
      sourceText: 'Account',
      format: 'simple',
      argumentSignature: '[]',
      contractHash: 'contract-account',
      sourceHash: 'source-account',
    },
    units: {
      es: { language: 'es', text: 'Cuenta', state: 'reviewed' },
    },
  },
  {
    key: 'mission.count',
    namespace: 'mission',
    sourceText: '{n, plural, one {# mission} other {# missions}}',
    kind: 'ui',
    format: 'icu',
    currentVersion: {
      id: 'https://example.test/key/mission.count/version/01',
      versionId: '01',
      sourceLanguage: 'en',
      sourceText: '{n, plural, one {# mission} other {# missions}}',
      format: 'icu',
      argumentSignature: '[["n",["plural"]]]',
      contractHash: 'contract-count',
      sourceHash: 'source-count',
    },
    units: {
      es: {
        language: 'es',
        text: '{n, plural, one {# misión} other {# misiones}}',
        state: 'reviewed',
      },
    },
  },
];

describe('schema-v2 translation releases', () => {
  it('canonicalizes nested JSON independent of insertion order', () => {
    expect(canonicalJson({ z: [3, { b: 2, a: 1 }], a: true })).toBe(
      '{"a":true,"z":[3,{"a":1,"b":2}]}',
    );
  });

  it('compiles deterministic immutable bases and a pinned descriptor', async () => {
    const input = {
      appId: 'https://example.test/app',
      branchId: 'https://example.test/branch/main',
      buildId: '2.4.0',
      publicBase: 'https://lang.example.test/workspace/app',
      channel: 'production' as const,
      languages: ['es', 'en'],
      defaultLanguage: 'en',
      reviewedOnlyLanguages: ['es'],
    };
    const first = await compileRelease(entries, input);
    const second = await compileRelease([...entries].reverse(), input);

    expect(first).toEqual(second);
    expect(first.descriptor).toMatchObject({
      schemaVersion: 2,
      appId: input.appId,
      releaseId: first.manifest.releaseId,
      contractSetHash: first.manifest.contractSetHash,
    });
    expect(first.descriptor.manifestUrl).toContain(
      `/releases/${first.manifest.releaseId}/manifest.json`,
    );
    expect(first.manifest.languages.es.base.url).toContain(
      `/objects/catalog/${first.manifest.languages.es.base.hash}.json`,
    );
    expect(first.immutableObjects).toHaveLength(2);
    expect(first.manifest.keyVersions['account.title']).toBe(
      entries[0].currentVersion!.id,
    );
    expect(first.manifest.quality.es.errors).toBe(0);
  });

  it('creates an exact-version hotfix and advances only its language lane', async () => {
    const compiled = await compileRelease(entries, {
      appId: 'app',
      branchId: 'branch',
      releaseId: 'release-1',
      publicBase: 'https://cdn.test/workspace/app',
      languages: ['en', 'es'],
      defaultLanguage: 'en',
    });
    const keyVersionId = entries[0].currentVersion!.id;
    expect(releaseReferencesKeyVersion(compiled.manifest, keyVersionId)).toBe(
      true,
    );
    const hotfix = await compileTranslationHotfix({
      manifest: compiled.manifest,
      keyVersionId,
      language: 'es',
      text: 'Cuenta corregida',
      currentMessages: { 'account.title': 'Cuenta' },
    });

    expect(hotfix).toMatchObject({
      key: 'account.title',
      sequence: 1,
      patch: { set: { 'account.title': 'Cuenta corregida' } },
    });
    expect(hotfix!.manifest.languages.es.patches).toHaveLength(1);
    expect(hotfix!.manifest.languages.en.patches).toHaveLength(0);
    expect(hotfix!.manifest.hotfixSequence).toBe(1);
    expect(
      await compileTranslationHotfix({
        manifest: hotfix!.manifest,
        keyVersionId,
        language: 'es',
        text: 'Cuenta corregida',
        currentMessages: { 'account.title': 'Cuenta corregida' },
      }),
    ).toBeNull();
  });

  it('blocks production releases with selected translation errors', async () => {
    const broken = structuredClone(entries);
    broken[1].units.es.text = '{other}';
    await expect(
      compileRelease(broken, {
        appId: 'app',
        branchId: 'branch',
        channel: 'production',
        languages: ['es'],
        defaultLanguage: 'en',
      }),
    ).rejects.toThrow('blocked by 1 quality error');
    await expect(
      compileRelease(broken, {
        appId: 'app',
        branchId: 'branch',
        channel: 'preview',
        languages: ['es'],
        defaultLanguage: 'en',
      }),
    ).resolves.toBeDefined();
  });

  it('includes termbase errors in the production publish gate', async () => {
    await expect(
      compileRelease(entries, {
        appId: 'app',
        branchId: 'branch',
        channel: 'production',
        languages: ['es'],
        defaultLanguage: 'en',
        glossary: [
          {
            id: 'term-account',
            term: 'Account',
            termType: 'keep',
            caseSensitive: true,
          },
        ],
      }),
    ).rejects.toThrow('blocked by 1 quality error');
  });

  it('applies ordered patch sets and explicit deletions without mutating base', () => {
    const base = { a: 'A', b: 'B' };
    expect(
      applyCatalogPatches(base, [
        { set: { a: 'A2', c: 'C' } },
        { set: { d: 'D' }, remove: ['b', 'c'] },
      ]),
    ).toEqual({ a: 'A2', d: 'D' });
    expect(base).toEqual({ a: 'A', b: 'B' });
  });

  it('compacts only beyond the patch-count or byte-ratio thresholds', () => {
    const lane = {
      base: { hash: 'base', url: 'objects/catalog/base.json', bytes: 400 },
      patches: Array.from({ length: 8 }, (_, index) => ({
        hash: `patch-${index}`,
        url: `objects/patch/patch-${index}.json`,
        bytes: 12,
        sequence: index + 1,
      })),
    };
    expect(shouldCompactTranslationLanguage(lane)).toBe(false);
    expect(
      shouldCompactTranslationLanguage({
        ...lane,
        patches: [
          ...lane.patches,
          {
            hash: 'patch-9',
            url: 'objects/patch/patch-9.json',
            bytes: 1,
            sequence: 9,
          },
        ],
      }),
    ).toBe(true);
    expect(
      shouldCompactTranslationLanguage({
        ...lane,
        patches: [{ ...lane.patches[0], bytes: 100 }],
      }),
    ).toBe(false);
    expect(
      shouldCompactTranslationLanguage({
        ...lane,
        patches: [{ ...lane.patches[0], bytes: 101 }],
      }),
    ).toBe(true);
  });

  it('materializes an equivalent base without changing release identity', async () => {
    const compiled = await compileRelease(entries, {
      appId: 'app',
      branchId: 'branch',
      releaseId: 'release-compact',
      publicBase: 'https://cdn.test/workspace/app',
      languages: ['es'],
      defaultLanguage: 'en',
    });
    compiled.manifest.hotfixSequence = 9;
    compiled.manifest.languages.es.patches = [
      {
        hash: 'old-patch',
        url: 'https://cdn.test/workspace/app/objects/patch/old-patch.json',
        bytes: 500,
        sequence: 9,
      },
    ];
    const messages = {
      'account.title': 'Cuenta corregida',
      'mission.count': {
        message: '{n, plural, one {# misión} other {# misiones}}',
        format: 'icu' as const,
      },
    };

    const compacted = await compileTranslationCompaction({
      manifest: compiled.manifest,
      language: 'es',
      currentMessages: messages,
    });

    expect(compacted).not.toBeNull();
    expect(compacted!.manifest).toMatchObject({
      releaseId: 'release-compact',
      contractSetHash: compiled.manifest.contractSetHash,
      hotfixSequence: 9,
    });
    expect(compacted!.manifest.languages.es.patches).toEqual([]);
    expect(decodeReleaseObject(compacted!.immutableObject.body)).toEqual(
      messages,
    );
    expect(compacted!.manifest.languages.es.base.url).toContain(
      `/objects/catalog/${compacted!.immutableObject.hash}.json`,
    );
  });

  it('prunes only old objects unreachable from every retained manifest', () => {
    const manifest = {
      schemaVersion: 2 as const,
      releaseId: 'release-retained',
      contractSetHash: 'contract',
      hotfixSequence: 1,
      keyVersions: {},
      quality: {},
      languages: {
        es: {
          base: {
            hash: 'base-live',
            url: 'https://cdn.test/ws/app/objects/catalog/base-live.json',
            bytes: 10,
          },
          patches: [
            {
              hash: 'patch-live',
              url: 'objects/patch/patch-live.json',
              bytes: 5,
              sequence: 1,
            },
          ],
        },
      },
    };
    const now = new Date('2026-07-28T00:00:00.000Z');
    const old = new Date('2026-06-01T00:00:00.000Z');
    const recent = new Date('2026-07-27T00:00:00.000Z');

    expect(
      selectPrunableTranslationObjects({
        manifests: [manifest],
        objects: [
          { name: 'objects/catalog/base-live.json', lastModified: old },
          { name: 'objects/patch/patch-live.json', lastModified: old },
          { name: 'objects/catalog/orphan-old.json', lastModified: old },
          { name: 'objects/patch/orphan-recent.json', lastModified: recent },
          { name: 'objects/catalog/unknown-age.json' },
          { name: 'releases/release-retained/manifest.json', lastModified: old },
        ],
        now,
        gracePeriodMs: 7 * 24 * 60 * 60 * 1000,
      }),
    ).toEqual(['objects/catalog/orphan-old.json']);
  });
});
