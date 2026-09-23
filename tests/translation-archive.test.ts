import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  createTranslationArchive,
  parseTranslationArchive,
  planTranslationArchiveRestore,
  TRANSLATION_ARCHIVE_MANIFEST_PATH,
  type ParsedTranslationArchive,
  type TranslationArchiveSnapshot,
} from '@_linked/translation/archive';
import { DEFAULT_TRANSLATION_JSON_ARCHIVE_LIMITS, sha256Hex } from '@_linked/translation';

const SOURCE_APP = 'https://create.now/workspace/source/app/example';
const TARGET_APP = 'https://create.now/workspace/target/app/example';
const SHAPE_IRI = 'https://linked.cm/pkg/profile/shape/Profile';
const WEB_ID = 'https://webid.email/id/translator';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function snapshot(
  overrides: Partial<TranslationArchiveSnapshot> = {},
): TranslationArchiveSnapshot {
  return {
    appId: SOURCE_APP,
    branchId: `${SOURCE_APP}/branch/main`,
    revisionWatermark: 'revision-42',
    collections: {
      configuration: [
        {
          id: `${SOURCE_APP}/translation/configuration`,
          data: {
            defaultLanguage: 'en',
            languages: ['en', 'es'],
          },
        },
      ],
      keys: [
        {
          id: `${SOURCE_APP}/translation/key/nav.home`,
          data: {
            appId: SOURCE_APP,
            key: 'nav.home',
            sourceText: 'Home',
            shapeIri: SHAPE_IRI,
          },
        },
      ],
      keyVersions: [
        {
          id: `${SOURCE_APP}/translation/key/nav.home/version/home-v1`,
          data: {
            keyId: `${SOURCE_APP}/translation/key/nav.home`,
            sourceText: 'Home',
            sourceHash: 'source-home',
            contractHash: 'contract-home',
          },
        },
      ],
      units: [
        {
          id: `${SOURCE_APP}/translation/unit/nav.home/es`,
          data: {
            keyId: `${SOURCE_APP}/translation/key/nav.home`,
            language: 'es',
            text: 'Inicio',
            state: 'reviewed',
          },
        },
      ],
      glossary: [
        {
          id: `${SOURCE_APP}/translation/glossary/oneness`,
          data: {
            term: 'Oneness',
            termType: 'keep',
          },
        },
      ],
      style: [
        {
          id: `${SOURCE_APP}/translation/style/default`,
          data: { tone: 'warm', formality: 'inclusive' },
        },
      ],
      revisions: [
        {
          id: `${SOURCE_APP}/translation/revision/rev-1`,
          data: {
            keyId: `${SOURCE_APP}/translation/key/nav.home`,
            text: 'Inicio',
            author: WEB_ID,
            decidedBy: WEB_ID,
            status: 'accepted',
          },
        },
      ],
      provenance: [
        {
          id: `${SOURCE_APP}/translation/provenance/nav.home`,
          data: {
            keyId: `${SOURCE_APP}/translation/key/nav.home`,
            source: 'package',
            fromPackage: '@linked.cm/profile',
            shapeIri: SHAPE_IRI,
          },
        },
      ],
      content: [
        {
          id: `${SOURCE_APP}/translation/content/welcome`,
          data: {
            nodeIri: `${SOURCE_APP}/content/home`,
            fieldIri: 'https://schema.org/headline',
            language: 'es',
            text: 'Bienvenido',
          },
        },
      ],
      releases: [
        {
          id: `${SOURCE_APP}/translation/release/release-1`,
          data: {
            releaseId: 'release-1',
            status: 'published',
            manifestUrl: 'https://cdn.example.test/release-1/manifest.json',
          },
        },
      ],
      buildPins: [
        {
          id: `${SOURCE_APP}/translation/build/build-1/pin`,
          data: {
            releaseId: 'release-1',
            contractSetHash: 'contract-set',
          },
        },
      ],
    },
    ...overrides,
  };
}

async function parsed(
  value: TranslationArchiveSnapshot = snapshot(),
): Promise<ParsedTranslationArchive> {
  return parseTranslationArchive((await createTranslationArchive(value)).body);
}

describe('full-fidelity translation archive', () => {
  it('round-trips a multilingual collection larger than a CAT file while enforcing explicit limits', async () => {
    const units = Array.from({ length: 9000 }, (_, index) => ({
      id: `${SOURCE_APP}/translation/unit/example-${index}/es`,
      data: {
        language: 'es',
        text: Array.from({ length: 160 }, (_, part) => `${index * 160 + part} acción `).join(''),
      },
    }));
    const serialized = await createTranslationArchive(snapshot({ collections: { units } }));
    expect(serialized.manifest.files.find(file => file.collection === 'units')!.bytes)
      .toBeGreaterThan(DEFAULT_TRANSLATION_JSON_ARCHIVE_LIMITS.maxEntryUncompressedBytes);
    const restored = await parseTranslationArchive(serialized.body);
    expect(restored.collections.units).toHaveLength(units.length);
    expect(restored.collections.units.find(unit => unit.id === units[8999].id)!.data.text)
      .toBe(units[8999].data.text);
    await expect(parseTranslationArchive(serialized.body, {
      limits: DEFAULT_TRANSLATION_JSON_ARCHIVE_LIMITS,
    })).rejects.toThrow('uncompressed size limit');
  }, 60000);

  it('serializes deterministically and plans an idempotent same-app restore', async () => {
    const firstArchive = await createTranslationArchive(snapshot());
    const secondArchive = await createTranslationArchive(snapshot());
    expect(firstArchive.body).toEqual(secondArchive.body);

    const archive = await parseTranslationArchive(firstArchive.body);
    const first = await planTranslationArchiveRestore(archive, {
      mode: 'same-app',
      targetAppId: SOURCE_APP,
    });
    expect(first.blocked).toBe(false);
    expect(first.creates).toBe(11);
    expect(first.historicalReleases).toBe(1);

    const afterFirstRestore = first.decisions.flatMap((decision) =>
      decision.record
        ? [
            {
              id: decision.record.id,
              contentHash: decision.record.contentHash,
            },
          ]
        : [],
    );
    const retry = await planTranslationArchiveRestore(archive, {
      mode: 'same-app',
      targetAppId: SOURCE_APP,
      targetRecords: afterFirstRestore,
    });
    expect(retry.blocked).toBe(false);
    expect(retry.creates).toBe(0);
    expect(retry.skips).toBe(11);
    expect(new Set(retry.decisions.map(({ retryKey }) => retryKey)).size).toBe(
      11,
    );
  });

  it('blocks a same-id, different-content collision', async () => {
    const archive = await parsed();
    const key = archive.collections.keys[0];
    const plan = await planTranslationArchiveRestore(archive, {
      mode: 'same-app',
      targetAppId: SOURCE_APP,
      targetRecords: [
        {
          id: key.id,
          contentHash: 'a'.repeat(64),
        },
      ],
    });

    expect(plan.blocked).toBe(true);
    expect(plan.collisions).toBe(1);
    expect(
      plan.decisions.find(({ sourceId }) => sourceId === key.id),
    ).toMatchObject({
      action: 'collision',
      expectedTargetContentHash: 'a'.repeat(64),
    });
  });

  it('rebases only app-scoped IRIs during cross-app migration', async () => {
    const archive = await parsed({
      ...snapshot(),
      collections: {
        ...snapshot().collections,
        content: [],
      },
    });
    const first = await planTranslationArchiveRestore(archive, {
      mode: 'cross-app',
      targetAppId: TARGET_APP,
    });
    const second = await planTranslationArchiveRestore(archive, {
      mode: 'cross-app',
      targetAppId: TARGET_APP,
    });
    const key = first.decisions.find(({ collection }) => collection === 'keys')
      ?.record;

    expect(first).toEqual(second);
    expect(key?.id).toBe(`${TARGET_APP}/translation/key/nav.home`);
    expect(key?.data.appId).toBe(TARGET_APP);
    expect(key?.data.shapeIri).toBe(SHAPE_IRI);
    expect(first.iriMappings[`${SOURCE_APP}/translation/key/nav.home`]).toBe(
      `${TARGET_APP}/translation/key/nav.home`,
    );
  });

  it('preserves WebIDs only as inert provenance', async () => {
    const plan = await planTranslationArchiveRestore(await parsed(), {
      mode: 'same-app',
      targetAppId: SOURCE_APP,
    });
    const revision = plan.decisions.find(
      ({ collection }) => collection === 'revisions',
    )?.record;

    expect(revision?.data.author).toBe(WEB_ID);
    expect(revision?.data.decidedBy).toBe(WEB_ID);
    expect(plan.identityWrites).toBe(0);
    expect(plan.assignmentWrites).toBe(0);
  });

  it('restores reference-only releases as retired history, never live delivery', async () => {
    const plan = await planTranslationArchiveRestore(await parsed(), {
      mode: 'same-app',
      targetAppId: SOURCE_APP,
    });
    const release = plan.decisions.find(
      ({ collection }) => collection === 'releases',
    )?.record;

    expect(release?.data).toMatchObject({
      status: 'retired',
      historical: true,
      activationEligible: false,
    });
    expect(plan.historicalReleases).toBe(1);
  });

  it('verifies included catalog objects and rejects corrupt bytes', async () => {
    const objectBody = encoder.encode('{"nav.home":"Inicio"}');
    const hash = await sha256Hex(decoder.decode(objectBody));
    const archive = await createTranslationArchive({
      ...snapshot(),
      objects: [
        {
          hash,
          body: objectBody,
          mediaType: 'application/json',
        },
        { hash: 'b'.repeat(64) },
      ],
    });
    const valid = await parseTranslationArchive(archive.body);
    expect(valid.objects).toEqual([
      expect.objectContaining({ hash, body: objectBody }),
      { hash: 'b'.repeat(64) },
    ]);

    const files = unzipSync(archive.body);
    files[`objects/catalog/${hash}.json`] = encoder.encode('corrupt');
    const corrupt = zipSync(files, {
      level: 6,
      mtime: new Date('1980-01-01T00:00:00.000Z'),
    });
    await expect(parseTranslationArchive(corrupt)).rejects.toThrow(
      `object "${hash}" failed verification`,
    );
  });

  it('requires explicit cross-app mappings for graph content', async () => {
    const archive = await parsed();
    const unmapped = await planTranslationArchiveRestore(archive, {
      mode: 'cross-app',
      targetAppId: TARGET_APP,
    });
    expect(unmapped.blocked).toBe(true);
    expect(unmapped.unresolvedContent).toBe(1);
    expect(
      unmapped.decisions.find(({ collection }) => collection === 'content'),
    ).toMatchObject({ action: 'unmapped' });

    const mapped = await planTranslationArchiveRestore(archive, {
      mode: 'cross-app',
      targetAppId: TARGET_APP,
      contentMappings: [
        {
          sourceNodeIri: `${SOURCE_APP}/content/home`,
          sourceFieldIri: 'https://schema.org/headline',
          targetNodeIri: `${TARGET_APP}/content/landing`,
          targetFieldIri: 'https://schema.org/headline',
        },
      ],
    });
    const content = mapped.decisions.find(
      ({ collection }) => collection === 'content',
    )?.record;
    expect(mapped.unresolvedContent).toBe(0);
    expect(mapped.blocked).toBe(false);
    expect(content?.data.nodeIri).toBe(`${TARGET_APP}/content/landing`);
  });

  it('rejects excluded security/control-plane fields and unsupported schemas', async () => {
    await expect(
      createTranslationArchive({
        ...snapshot(),
        collections: {
          ...snapshot().collections,
          style: [
            {
              id: `${SOURCE_APP}/translation/style/unsafe`,
              data: { apiKey: 'must-not-enter-an-archive' },
            },
          ],
        },
      }),
    ).rejects.toThrow('excluded security or control-plane data');

    const archive = await createTranslationArchive(snapshot());
    const files = unzipSync(archive.body);
    const manifest = JSON.parse(
      decoder.decode(files[TRANSLATION_ARCHIVE_MANIFEST_PATH]),
    );
    manifest.schemaVersion = 2;
    files[TRANSLATION_ARCHIVE_MANIFEST_PATH] = encoder.encode(
      JSON.stringify(manifest),
    );
    await expect(
      parseTranslationArchive(
        zipSync(files, {
          level: 6,
          mtime: new Date('1980-01-01T00:00:00.000Z'),
        }),
      ),
    ).rejects.toThrow('Unsupported translation archive schemaVersion');
  });
});
