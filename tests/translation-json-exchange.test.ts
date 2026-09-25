import { readFile } from 'node:fs/promises';

import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import type { TranslationExchangeDocument } from '../src/exchange.js';
import {
  parseI18nextJson,
  serializeI18nextJsonZip,
} from '../src/formats/json.js';

const fixture = (name: string) =>
  readFile(`tests/fixtures/json/${name}`).then(
    (body) => new Uint8Array(body),
  );

const document = (): TranslationExchangeDocument => ({
  schemaVersion: 1,
  appId: 'https://example.test/apps/one',
  branchId: 'https://example.test/apps/one/branches/main',
  sourceLanguage: 'en',
  targetLanguages: ['es'],
  exportedAt: '2026-07-29T12:00:00.000Z',
  revisionWatermark: 'revision-12',
  contractSetHash: 'contract-set-12',
  entries: [
    {
      key: 'account.save',
      kind: 'ui',
      sourceText: 'Save',
      keyVersionId: 'https://example.test/keys/account.save/versions/1',
      sourceHash: 'a'.repeat(64),
      contractHash: 'b'.repeat(64),
      argumentSignature: '[]',
      description: 'Save the current account.',
      format: 'simple',
      translations: {
        es: { text: 'Guardar', state: 'reviewed', note: 'Approved by María.' },
      },
    },
    {
      key: 'item_one',
      kind: 'ui',
      sourceText: 'One item',
      keyVersionId: 'https://example.test/keys/item_one/versions/1',
      sourceHash: 'c'.repeat(64),
      contractHash: 'd'.repeat(64),
      argumentSignature: '[]',
      format: 'simple',
      translations: {
        es: { text: 'Un elemento', state: 'machine' },
      },
    },
    {
      key: 'item_other',
      kind: 'ui',
      sourceText: 'Many items',
      keyVersionId: 'https://example.test/keys/item_other/versions/1',
      sourceHash: 'e'.repeat(64),
      contractHash: 'f'.repeat(64),
      argumentSignature: '[]',
      format: 'simple',
      translations: {
        es: { text: 'Muchos elementos', state: 'stale' },
      },
    },
  ],
});

describe('i18next JSON exchange', () => {
  it('maps flat and nested JSON to the same deterministic key set', async () => {
    const [flat, nested] = await Promise.all([
      parseI18nextJson(await fixture('flat.json'), {
        language: 'en',
        sourceLanguage: 'und',
      }),
      parseI18nextJson(await fixture('nested.json'), {
        language: 'en',
        sourceLanguage: 'und',
      }),
    ]);
    expect(flat).toEqual(nested);
    expect(flat.entries.map((entry) => entry.key)).toEqual([
      'account.save',
      'item_one',
      'item_other',
    ]);

    const first = serializeI18nextJsonZip(document(), { layout: 'flat' });
    const second = serializeI18nextJsonZip(document(), { layout: 'flat' });
    expect(first.body).toEqual(second.body);
  });

  it('reports a value/namespace collision before writing nested output', () => {
    const input = document();
    input.entries = [
      { ...input.entries[0], key: 'a' },
      { ...input.entries[1], key: 'a.b' },
    ];
    expect(() =>
      serializeI18nextJsonZip(input, { layout: 'nested' }),
    ).toThrow('"a" is both a value and a namespace');
  });

  it('keeps i18next plural suffixes opaque and simple', async () => {
    const parsed = await parseI18nextJson(await fixture('flat.json'), {
      language: 'en',
    });
    expect(
      parsed.entries
        .filter((entry) => entry.key.startsWith('item_'))
        .map((entry) => [entry.key, entry.format]),
    ).toEqual([
      ['item_one', 'simple'],
      ['item_other', 'simple'],
    ]);
  });

  it('round-trips version evidence, language values, states and notes in ZIP', async () => {
    const serialized = serializeI18nextJsonZip(document(), {
      layout: 'nested',
    });
    const files = unzipSync(serialized.body);
    expect(Object.keys(files).sort()).toEqual([
      'linked.exchange.json',
      'locales/en.json',
      'locales/es.json',
    ]);

    const parsed = await parseI18nextJson(serialized.body);
    expect(parsed).toEqual(document());
  });

  it('treats standalone target JSON as unverified evidence', async () => {
    const parsed = await parseI18nextJson(
      await fixture('standalone-es.json'),
      {
        fileName: 'es.json',
        sourceLanguage: 'en',
      },
    );
    expect(parsed.sourceLanguage).toBe('en');
    expect(parsed.targetLanguages).toEqual(['es']);
    expect(parsed.entries[0]).toMatchObject({
      key: 'account.save',
      format: 'simple',
      translations: { es: { text: 'Guardar' } },
    });
    expect(parsed.entries[0].sourceText).toBeUndefined();
    expect(parsed.entries[0].keyVersionId).toBeUndefined();
    expect(parsed.entries[0].sourceHash).toBeUndefined();
    expect(parsed.entries[0].contractHash).toBeUndefined();
    expect(parsed.entries[0].argumentSignature).toBeUndefined();
  });

  it('rejects traversal and absolute ZIP entry paths before extraction', () => {
    for (const path of ['../es.json', '/tmp/es.json', 'C:\\tmp\\es.json']) {
      const archive = zipSync({ [path]: new TextEncoder().encode('{}') });
      expect(() => parseI18nextJson(archive)).toThrow('Unsafe ZIP entry path');
    }
  });

  it('rejects duplicate entries before extraction', () => {
    const duplicate = zipSync({
      'one.json': new TextEncoder().encode('{"one":"1"}'),
      'two.json': new TextEncoder().encode('{"two":"2"}'),
    });
    const from = new TextEncoder().encode('two.json');
    const to = new TextEncoder().encode('one.json');
    for (let offset = 0; offset <= duplicate.length - from.length; offset += 1) {
      if (from.every((byte, index) => duplicate[offset + index] === byte)) {
        duplicate.set(to, offset);
      }
    }
    expect(() => parseI18nextJson(duplicate)).toThrow('duplicate entry');
  });

  it('rejects entry-count, expanded-size and compression-ratio bombs', () => {
    const many = zipSync({
      '1.json': new Uint8Array(),
      '2.json': new Uint8Array(),
    });
    expect(() =>
      parseI18nextJson(many, { limits: { maxEntries: 1 } }),
    ).toThrow('entry-count limit');

    const large = zipSync({
      'large.json': new TextEncoder().encode('x'.repeat(4096)),
    });
    expect(() =>
      parseI18nextJson(large, {
        limits: { maxEntryUncompressedBytes: 1024 },
      }),
    ).toThrow('uncompressed size limit');
    expect(() =>
      parseI18nextJson(large, { limits: { maxCompressionRatio: 2 } }),
    ).toThrow('compression-ratio limit');
  });
});


describe('Tolgee JSON ZIP', () => {
  const archive = (files: Record<string, unknown>) => zipSync(Object.fromEntries(
    Object.entries(files).map(([name, value]) => [name, new TextEncoder().encode(JSON.stringify(value))]),
  ));

  it('uses English as source and preserves all target locales without inventing review/version evidence', () => {
    const result = parseI18nextJson(archive({
      'common/en.json': { welcome: 'Welcome', account: { save: 'Save' } },
      'common/es.json': { welcome: 'Bienvenido', account: { save: 'Guardar' } },
      'common/fr.json': { welcome: 'Bienvenue' },
      'en.json': { 'button.return': 'Return' },
      'fr.json': { 'button.return': 'Retour' },
      'common/zh-Hans.json': { welcome: '欢迎', account: { save: '' } },
    }));
    expect(result.sourceLanguage).toBe('en');
    expect(result.targetLanguages).toEqual(['es', 'fr', 'zh-Hans']);
    expect(result.entries.find((row) => row.key === 'welcome')).toMatchObject({
      sourceText: 'Welcome', translations: {
        es: { text: 'Bienvenido' }, fr: { text: 'Bienvenue' }, 'zh-Hans': { text: '欢迎' },
      },
    });
    expect(result.entries[0].translations['zh-Hans']).toBeUndefined();
    for (const row of result.entries) {
      expect(row.namespace).toBeUndefined();
      expect(row.keyVersionId).toBeUndefined();
      expect(row.translations.en).toBeUndefined();
      expect(row.translations.es?.state).toBeUndefined();
    }
  });

  it('requires source files and rejects keys without source text', () => {
    expect(() => parseI18nextJson(archive({ 'common/es.json': { a: 'Uno' } }))).toThrow('source text');
    expect(() => parseI18nextJson(archive({
      'common/en.json': { a: 'One' }, 'common/es.json': { b: 'Dos' },
    }))).toThrow('has no source text');
  });

  it('rejects ambiguous locales and unexpected paths', () => {
    expect(() => parseI18nextJson(archive({
      'common/en.json': {}, 'common/EN.json': {},
    }))).toThrow('duplicate language');
    expect(() => parseI18nextJson(archive({ 'unexpected/nested/en.json': {} }))).toThrow('namespace/language.json');
    expect(() => parseI18nextJson(archive({ '../en.json': {} }))).toThrow('Unsafe ZIP');
  });

  it('keeps the ZIP size, entry count and compression-ratio limits for foreign archives', () => {
    const bytes = archive({ 'common/en.json': { a: 'a'.repeat(5000) }, 'common/es.json': {} });
    expect(() => parseI18nextJson(bytes, { limits: { maxEntries: 1, maxCompressionRatio: 10000 } })).toThrow('entry-count');
    expect(() => parseI18nextJson(bytes, { limits: { maxTotalUncompressedBytes: 100 } })).toThrow('uncompressed');
    expect(() => parseI18nextJson(bytes, { limits: { maxCompressionRatio: 2 } })).toThrow('compression-ratio');
  });
});
