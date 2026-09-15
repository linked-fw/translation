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
import { sha256Hex } from '../src/key-version.js';

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
