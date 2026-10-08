import { describe, expect, it } from 'vitest';
import type { TranslationEntryRecord } from '../src/records.js';
import {
  assertTranslationContractSet,
  assertTranslationObjectHash,
  buildSnapshotContractSetHash,
  compileRelease,
  createTranslationBuildPin,
  findReusableCompiledRelease,
  translationContractSetHash,
} from '../src/release.js';
import {
  sha256Hex,
  deriveTranslationKeyVersionContract,
} from '../src/key-version.js';

const entries: TranslationEntryRecord[] = [{
  id: 'key',
  key: 'nav.home',
  namespace: 'nav',
  sourceText: 'Home',
  kind: 'ui',
  format: 'simple',
  units: {},
  currentVersion: {
    id: 'version-home',
    versionId: 'home',
    sourceLanguage: 'en',
    sourceText: 'Home',
    format: 'simple',
    argumentSignature: '[]',
    contractHash: 'contract-home',
    sourceHash: 'source-home',
  },
}];

describe('build-owned translation pins', () => {
  it('derives the release contract hash from the build snapshot', async () => {
    const buildHash = await buildSnapshotContractSetHash(entries, [{
      key: 'nav.home',
      sourceText: 'Home',
      file: 'app.tsx',
      line: 1,
    }]);
    expect(buildHash).toBe(await translationContractSetHash(entries));
    expect(() => assertTranslationContractSet(buildHash, buildHash)).not.toThrow();
  });

  it('rejects a build whose source defaults drifted', async () => {
    await expect(buildSnapshotContractSetHash(entries, [{
      key: 'nav.home',
      sourceText: 'Homepage',
      file: 'app.tsx',
      line: 1,
    }])).rejects.toThrow('source-changed');
  });

  it('does not bypass a changed argument contract just because the app owns an override', async () => {
    await expect(
      buildSnapshotContractSetHash(
        [
          {
            ...entries[0],
            overridden: true,
            ofResource: 'https://package.example/help',
          },
        ],
        [
          {
            key: 'nav.home',
            sourceText: 'Package help for {font}',
            format: 'simple',
          },
        ]
      )
    ).rejects.toThrow('argument-contract-changed');
  });

  const appHelp = async (
    sourceText: string,
    format: 'simple' | 'icu' = 'simple'
  ): Promise<TranslationEntryRecord> => ({
    key: 'help.weight',
    namespace: 'builder.css',
    sourceText,
    format,
    kind: 'ui',
    overridden: true,
    ofResource: 'https://package.example/help/weight',
    fromPackage: '@foreign/controls',
    units: {},
    currentVersion: {
      ...(await deriveTranslationKeyVersionContract({
        sourceText,
        format,
        sourceLanguage: 'en',
      })),
      id: 'urn:app:help:version',
      versionId: 'app-help-version',
    },
  });

  it('pins compatible app-owned help and compiles the app wording, never the package default', async () => {
    const entry = await appHelp('Choose how thick {font} looks.');
    const original = JSON.stringify(entry);
    const declarations = [
      {
        key: entry.key,
        namespace: entry.namespace,
        sourceText: 'Thickness for {font}.',
        format: 'simple' as const,
        status: 'confirmed' as const,
      },
    ];
    const hash = await buildSnapshotContractSetHash([entry], declarations);
    const release = await compileRelease([entry], {
      appId: 'app',
      branchId: 'branch',
      channel: 'preview',
      defaultLanguage: 'en',
      languages: ['en'],
      publicBase: 'https://cdn.example/app',
    });
    expect(release.manifest.contractSetHash).toBe(hash);
    expect(release.manifest.keyVersions[entry.key]).toBe(
      entry.currentVersion!.id
    );
    expect(
      JSON.parse(new TextDecoder().decode(release.immutableObjects[0].body))
    ).toEqual({ [entry.key]: entry.sourceText });
    expect(JSON.stringify(entry)).toBe(original);
    expect(declarations[0].sourceText).toBe('Thickness for {font}.');
  });

  it('an upstream wording-only update remains compatible with the explicit local wording', async () => {
    const entry = await appHelp('Our help for {font}.');
    const hash = await translationContractSetHash([entry]);
    for (const sourceText of [
      'Package help for {font}.',
      'Updated package wording about {font}.',
    ]) {
      await expect(
        buildSnapshotContractSetHash(
          [entry],
          [
            {
              key: entry.key,
              namespace: entry.namespace,
              sourceText,
              format: 'simple',
            },
          ]
        )
      ).resolves.toBe(hash);
    }
  });

  it.each([
    ['missing override flag', { overridden: undefined }],
    ['false override flag', { overridden: false }],
    ['no declared owner', { ofResource: undefined, fromPackage: undefined }],
  ])('retains source-drift refusal for %s', async (_name, patch) => {
    const entry = { ...(await appHelp('App help')), ...patch };
    await expect(
      buildSnapshotContractSetHash(
        [entry],
        [{ key: entry.key, sourceText: 'Package help', format: 'simple' }]
      )
    ).rejects.toThrow('source-changed');
  });

  it.each([
    ['format', 'Package {font}', 'icu', 'format-changed'],
    [
      'renamed argument',
      'Package {family}',
      'simple',
      'argument-contract-changed',
    ],
    [
      'new argument',
      'Package {font} {weight}',
      'simple',
      'argument-contract-changed',
    ],
    ['removed argument', 'Package help', 'simple', 'argument-contract-changed'],
  ] as const)(
    'refuses changed %s rather than weakening the message contract',
    async (_name, sourceText, format, reason) => {
      const entry = await appHelp('Our {font} help');
      await expect(
        buildSnapshotContractSetHash(
          [entry],
          [{ key: entry.key, sourceText, format }]
        )
      ).rejects.toThrow(reason);
    }
  );

  it('refuses changed ICU roles and invalid messages', async () => {
    const entry = await appHelp(
      '{count, plural, one {One item} other {Many items}}',
      'icu'
    );
    await expect(
      buildSnapshotContractSetHash(
        [entry],
        [{ key: entry.key, sourceText: '{count, number} items', format: 'icu' }]
      )
    ).rejects.toThrow('argument-contract-changed');
    await expect(
      buildSnapshotContractSetHash(
        [entry],
        [{ key: entry.key, sourceText: '{count, plural,', format: 'icu' }]
      )
    ).rejects.toThrow('Cannot version invalid ICU');
  });

  it('requires an explicit source format and internally consistent app version', async () => {
    const entry = await appHelp('Local help');
    await expect(
      buildSnapshotContractSetHash(
        [entry],
        [
          {
            key: entry.key,
            sourceText: 'Package help',
            file: 'app.ts',
            line: 1,
          },
        ]
      )
    ).rejects.toThrow('source-changed');
    const corrupt = {
      ...entry,
      currentVersion: {
        ...entry.currentVersion!,
        sourceText: 'Local {missingSignature} help',
      },
    };
    await expect(
      buildSnapshotContractSetHash(
        [corrupt],
        [{ key: entry.key, sourceText: 'Package help', format: 'simple' }]
      )
    ).rejects.toThrow('source-changed');
  });

  it('does not use an app override to settle conflicting package authorities', async () => {
    const entry = await appHelp('Local help');
    await expect(
      buildSnapshotContractSetHash(
        [entry],
        [
          { key: entry.key, sourceText: 'Package one', format: 'simple' },
          { key: entry.key, sourceText: 'Package two', format: 'simple' },
        ]
      )
    ).rejects.toThrow('conflicting source defaults or formats');
  });

  it('requires the same declared namespace and a source mirror that matches the immutable version', async () => {
    const entry = await appHelp('Local help');
    for (const namespace of [undefined, 'another.namespace']) {
      await expect(
        buildSnapshotContractSetHash(
          [entry],
          [
            {
              key: entry.key,
              namespace,
              sourceText: 'Package help',
              format: 'simple',
            },
          ]
        )
      ).rejects.toThrow('source-changed');
    }
    const mirrorMismatch = {
      ...entry,
      sourceText: 'Incorrect mirror {unexpected}',
    };
    await expect(
      buildSnapshotContractSetHash(
        [mirrorMismatch],
        [
          {
            key: entry.key,
            namespace: entry.namespace,
            sourceText: 'Package help',
            format: 'simple',
          },
        ]
      )
    ).rejects.toThrow('source-changed');
  });

  it('uses the key-version classifier for confirmed declaration contracts', async () => {
    await expect(buildSnapshotContractSetHash(entries, [{
      key: 'nav.home',
      sourceText: 'Home',
      format: 'simple',
      kind: 'semantic',
      status: 'confirmed',
      authoritative: true,
    }])).resolves.toBe(await translationContractSetHash(entries));

    await expect(buildSnapshotContractSetHash(entries, [{
      key: 'nav.home',
      sourceText: 'Home',
      format: 'icu',
      status: 'confirmed',
    }])).rejects.toThrow('format-changed');
  });

  it('excludes pending, non-authoritative, and content declarations', async () => {
    const buildHash = await buildSnapshotContractSetHash(entries, [
      {
        key: 'nav.home',
        sourceText: 'Home',
        format: 'simple',
        status: 'confirmed',
      },
      {
        key: 'runtime.only',
        sourceText: 'Observed',
        status: 'pending',
      },
      {
        key: 'content.title',
        sourceText: 'Title',
        kind: 'content',
        status: 'confirmed',
      },
      {
        key: 'untrusted.key',
        sourceText: 'Untrusted',
        authoritative: false,
      },
    ]);
    expect(buildHash).toBe(await translationContractSetHash(entries));
  });

  it('rejects conflicting authoritative defaults or formats', async () => {
    await expect(buildSnapshotContractSetHash(entries, [
      { key: 'nav.home', sourceText: 'Home', format: 'simple' },
      { key: 'nav.home', sourceText: 'Homepage', format: 'simple' },
    ])).rejects.toThrow('conflicting source defaults or formats');
  });

  it('verifies catalog bytes and creates a JSON-serializable pin', async () => {
    const json = '{"nav.home":"Inicio"}';
    const hash = await sha256Hex(json);
    await expect(assertTranslationObjectHash(json, hash)).resolves.toBeUndefined();
    await expect(assertTranslationObjectHash('{}', hash)).rejects.toThrow(
      'hash mismatch',
    );
    const pin = createTranslationBuildPin({
      descriptor: {
        schemaVersion: 2,
        appId: 'app',
        releaseId: 'release',
        contractSetHash: 'contract-set',
        manifestUrl: 'https://cdn/releases/release/manifest.json',
      },
      manifest: {
        schemaVersion: 2,
        releaseId: 'release',
        contractSetHash: 'contract-set',
        hotfixSequence: 0,
        keyVersions: { 'nav.home': 'version-home' },
        quality: {},
        languages: {
          es: {
            base: { hash, url: `https://cdn/objects/catalog/${hash}.json`, bytes: json.length },
            patches: [],
          },
        },
      },
      manifestHash: 'manifest-hash',
      branchId: 'branch',
      buildId: 'build',
      channel: 'production',
      pinnedAt: '2026-07-28T00:00:00.000Z',
    });
    expect(JSON.parse(JSON.stringify(pin))).toEqual(pin);
    expect(pin.catalogs.es.hash).toBe(hash);
    expect(pin.hotfixSequence).toBe(0);
  });

  it('reuses only a byte-equivalent manifest under the existing release id', async () => {
    const input = {
      appId: 'app',
      branchId: 'branch',
      publicBase: 'https://cdn/app',
      channel: 'production' as const,
      languages: ['en'],
      defaultLanguage: 'en',
    };
    const existing = await compileRelease(entries, {
      ...input,
      releaseId: 'release-existing',
    });
    const reused = await findReusableCompiledRelease(entries, input, [{
      releaseId: 'release-existing',
      manifestHash: existing.manifestHash,
    }]);
    const changed = await findReusableCompiledRelease(entries, {
      ...input,
      languages: ['en', 'es'],
    }, [{
      releaseId: 'release-existing',
      manifestHash: existing.manifestHash,
    }]);

    expect(reused?.descriptor.releaseId).toBe('release-existing');
    expect(changed).toBeNull();
  });
});
