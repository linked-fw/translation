/**
 * The exchange formats used to carry Create Now's name (`cn:`,
 * `create-now-*`, `createNowEscaping`). They now carry neutral,
 * framework-level identifiers. Writers emit only the new spelling; readers
 * accept both, so a file exported by an older version still imports.
 *
 * Both directions are asserted here: new output must not contain the old
 * spelling, and a legacy file must parse to the same document as its
 * modern equivalent.
 */
import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { sha256Hex } from '@_linked/translation';
import { canonicalJson } from '../src/release.js';
import {
  createTranslationArchive,
  parseTranslationArchive,
  TRANSLATION_ARCHIVE_MANIFEST_PATH,
  type TranslationArchiveSnapshot,
} from '../src/archive.js';
import type { TranslationExchangeDocument } from '../src/exchange.js';
import { translationCsvAdapter, TRANSLATION_CSV_COLUMNS } from '../src/formats/csv.js';
import {
  parseI18nextJson,
  serializeI18nextJsonZip,
} from '../src/formats/json.js';
import { xliff12Adapter, xliff20Adapter } from '../src/formats/xliff.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Every identifier that must no longer appear in anything we write. */
const LEGACY_SPELLINGS: Array<[legacy: string, modern: string]> = [
  ['https://create-now.app/ns/translation-exchange/1', 'https://id.linked.cm/translation/exchange/1'],
  ['xmlns:cn=', 'xmlns:lt='],
  ['cn:', 'lt:'],
  ['create-now-description', 'linked-description'],
  ['create-now-target', 'linked-target'],
  ['original="create-now"', 'original="linked"'],
  ['createNowEscaping', 'escaping'],
  ['create-now-translation-archive', 'linked-translation-archive'],
  ['create-now.translation-archive.json', 'linked.translation-archive.json'],
  ['create-now-translations.backup.zip', 'linked-translations.backup.zip'],
  ['create-now-i18next-zip', 'linked-i18next-zip'],
  ['create-now.exchange.json', 'linked.exchange.json'],
];

/** Rewrite modern output back into the spelling an older export produced. */
function toLegacyText(modern: string): string {
  let text = modern;
  for (const [legacy, current] of LEGACY_SPELLINGS) {
    text = text.split(current).join(legacy);
  }
  return text;
}

function document(): TranslationExchangeDocument {
  return {
    schemaVersion: 1,
    appId: 'https://example.test/apps/serve',
    branchId: 'change-17',
    sourceLanguage: 'en-US',
    targetLanguages: ['es'],
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
        sourceHash: 'a'.repeat(64),
        contractHash: 'b'.repeat(64),
        argumentSignature: '[]',
        description: 'Shown in the primary navigation.',
        format: 'simple',
        translations: {
          es: {
            text: 'Inicio',
            state: 'reviewed',
            note: 'Approved by the navigation reviewer.',
          },
        },
      },
    ],
  };
}

function archiveSnapshot(): TranslationArchiveSnapshot {
  return {
    appId: 'https://example.test/apps/serve',
    branchId: 'https://example.test/apps/serve/branch/main',
    revisionWatermark: 'revision-42',
    createdAt: '2026-07-29T12:00:00.000Z',
    collections: {
      configuration: [
        {
          id: 'https://example.test/apps/serve/translation/configuration',
          data: { defaultLanguage: 'en', languages: ['en', 'es'] },
        },
      ],
      keys: [],
      keyVersions: [],
      units: [],
      glossary: [],
      style: [],
      revisions: [],
    },
  };
}

describe('exchange wire-format identifiers', () => {
  describe('writers emit the neutral spelling', () => {
    it('XLIFF 1.2 declares the linked namespace and neutral note names', async () => {
      const xml = decoder.decode((await xliff12Adapter.serialize(document())).body);
      expect(xml).toContain(
        'xmlns:lt="https://id.linked.cm/translation/exchange/1"',
      );
      expect(xml).toContain('lt:key="navigation.home"');
      expect(xml).toContain('lt:app-id="https://example.test/apps/serve"');
      expect(xml).toContain('original="linked"');
      expect(xml).toContain('<note from="linked-description">');
      expect(xml).toContain('from="linked-target"');
      expect(xml).not.toMatch(/create-now|cn:/);
    });

    it('XLIFF 2.0 declares the linked namespace and neutral note names', async () => {
      const xml = decoder.decode((await xliff20Adapter.serialize(document())).body);
      expect(xml).toContain(
        'xmlns:lt="https://id.linked.cm/translation/exchange/1"',
      );
      expect(xml).toContain('lt:state="reviewed"');
      expect(xml).toContain('<note category="linked-description">');
      expect(xml).toContain('category="linked-target"');
      expect(xml).not.toMatch(/create-now|cn:/);
    });

    it('CSV names the escaping column without a product prefix', async () => {
      expect(TRANSLATION_CSV_COLUMNS).toContain('escaping');
      expect(TRANSLATION_CSV_COLUMNS).not.toContain('createNowEscaping');
      const csv = decoder.decode((await translationCsvAdapter.serialize(document())).body);
      expect(csv.split('\n')[0]).toContain('escaping');
      expect(csv).not.toContain('createNowEscaping');
    });

    it('the archive manifest, its path and the backup filename are neutral', async () => {
      expect(TRANSLATION_ARCHIVE_MANIFEST_PATH).toBe(
        'linked.translation-archive.json',
      );
      const archive = await createTranslationArchive(archiveSnapshot());
      expect(archive.fileName).toBe('linked-translations.backup.zip');
      expect(archive.manifest.format).toBe('linked-translation-archive');
      const files = unzipSync(archive.body);
      expect(Object.keys(files)).toContain('linked.translation-archive.json');
      expect(decoder.decode(files['linked.translation-archive.json']!)).not.toContain(
        'create-now',
      );
    });

    it('the JSON ZIP sidecar path and format id are neutral', () => {
      const zip = serializeI18nextJsonZip(document());
      const files = unzipSync(zip.body);
      expect(Object.keys(files)).toContain('linked.exchange.json');
      expect(Object.keys(files)).not.toContain('create-now.exchange.json');
      const sidecar = JSON.parse(decoder.decode(files['linked.exchange.json']!));
      expect(sidecar.format).toBe('linked-i18next-zip');
    });
  });

  describe('readers still accept a file written with the old spelling', () => {
    it('imports a legacy XLIFF 1.2 export identically to a modern one', async () => {
      const modern = decoder.decode((await xliff12Adapter.serialize(document())).body);
      const legacy = toLegacyText(modern);
      // The rewrite must actually have changed something, or the comparison
      // below would be a modern file against itself.
      expect(legacy).not.toBe(modern);
      expect(legacy).toContain('xmlns:cn="https://create-now.app/ns/translation-exchange/1"');
      expect(legacy).toContain('cn:key="navigation.home"');
      expect(legacy).toContain('<note from="create-now-description">');

      const fromLegacy = await xliff12Adapter.parse(encoder.encode(legacy));
      expect(fromLegacy).toEqual(await xliff12Adapter.parse(encoder.encode(modern)));
      // Not merely equal-and-empty: the metadata actually survived.
      expect(fromLegacy.appId).toBe('https://example.test/apps/serve');
      expect(fromLegacy.revisionWatermark).toBe('revision-42');
      expect(fromLegacy.entries[0]!.key).toBe('navigation.home');
      expect(fromLegacy.entries[0]!.description).toBe(
        'Shown in the primary navigation.',
      );
      expect(fromLegacy.entries[0]!.translations.es).toMatchObject({
        text: 'Inicio',
        state: 'reviewed',
        note: 'Approved by the navigation reviewer.',
      });
    });

    it('imports a legacy XLIFF 2.0 export identically to a modern one', async () => {
      const modern = decoder.decode((await xliff20Adapter.serialize(document())).body);
      const legacy = toLegacyText(modern);
      expect(legacy).not.toBe(modern);
      expect(legacy).toContain('cn:state="reviewed"');
      expect(legacy).toContain('<note category="create-now-description">');

      const fromLegacy = await xliff20Adapter.parse(encoder.encode(legacy));
      expect(fromLegacy).toEqual(await xliff20Adapter.parse(encoder.encode(modern)));
      expect(fromLegacy.entries[0]!.description).toBe(
        'Shown in the primary navigation.',
      );
      expect(fromLegacy.entries[0]!.translations.es).toMatchObject({
        text: 'Inicio',
        state: 'reviewed',
        note: 'Approved by the navigation reviewer.',
      });
    });

    it('imports a legacy CSV whose escaping column is still createNowEscaping', async () => {
      const modern = decoder.decode((await translationCsvAdapter.serialize(document())).body);
      const legacy = toLegacyText(modern);
      expect(legacy).not.toBe(modern);
      expect(legacy.split('\n')[0]).toContain('createNowEscaping');

      const fromLegacy = await translationCsvAdapter.parse(encoder.encode(legacy));
      expect(fromLegacy).toEqual(
        await translationCsvAdapter.parse(encoder.encode(modern)),
      );
      expect(fromLegacy.entries[0]!.key).toBe('navigation.home');
      expect(fromLegacy.entries[0]!.translations.es?.text).toBe('Inicio');
    });

    it('parses a legacy archive, manifest path, format id and content hash included', async () => {
      const archive = await createTranslationArchive(archiveSnapshot());
      const files = unzipSync(archive.body);
      const manifest = JSON.parse(
        decoder.decode(files['linked.translation-archive.json']!),
      );

      // Reproduce what an older writer produced: the legacy format id, and
      // the content hash recomputed over it (the id is inside the hash input).
      manifest.format = 'create-now-translation-archive';
      const { archiveContentHash: _drop, ...unsigned } = manifest;
      manifest.archiveContentHash = await sha256Hex(
        canonicalJson({
          schemaVersion: unsigned.schemaVersion,
          format: unsigned.format,
          appId: unsigned.appId,
          branchId: unsigned.branchId,
          revisionWatermark: unsigned.revisionWatermark,
          ...(unsigned.createdAt ? { createdAt: unsigned.createdAt } : {}),
          files: unsigned.files,
          objects: unsigned.objects,
          exclusions: unsigned.exclusions,
        }),
      );

      const legacyFiles: Record<string, Uint8Array> = {};
      for (const [path, body] of Object.entries(files)) {
        if (path === 'linked.translation-archive.json') continue;
        legacyFiles[path] = body;
      }
      legacyFiles['create-now.translation-archive.json'] = encoder.encode(
        canonicalJson(manifest),
      );
      const legacyBody = zipSync(legacyFiles as never, {
        level: 6,
        mtime: new Date('1980-01-01T00:00:00.000Z'),
      });

      const parsed = await parseTranslationArchive(legacyBody);
      expect(parsed.manifest.format).toBe('create-now-translation-archive');
      expect(parsed.manifest.appId).toBe('https://example.test/apps/serve');
      expect(parsed.collections.configuration).toHaveLength(1);
    });

    it('parses a legacy JSON ZIP whose sidecar keeps the old path and format id', () => {
      const zip = serializeI18nextJsonZip(document());
      const files = unzipSync(zip.body);
      const legacyFiles: Record<string, Uint8Array> = {};
      for (const [path, body] of Object.entries(files)) {
        if (path === 'linked.exchange.json') continue;
        legacyFiles[path] = body;
      }
      legacyFiles['create-now.exchange.json'] = encoder.encode(
        toLegacyText(decoder.decode(files['linked.exchange.json']!)),
      );
      const legacyBody = zipSync(legacyFiles as never, {
        level: 6,
        mtime: new Date('1980-01-01T00:00:00.000Z'),
      });

      const parsed = parseI18nextJson(legacyBody, { fileName: 'legacy.zip' });
      expect(parsed.entries[0]!.key).toBe('navigation.home');
      expect(parsed.entries[0]!.translations.es?.text).toBe('Inicio');
    });
  });
});
