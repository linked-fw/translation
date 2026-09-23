import { describe, expect, it } from 'vitest';
import type { TranslationExchangeDocument } from '../src/exchange.js';
import {
  TRANSLATION_CSV_COLUMNS,
  translationCsvAdapter,
} from '../src/formats/csv.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function versionedDocument(): TranslationExchangeDocument {
  return {
    schemaVersion: 1,
    appId: 'app-1',
    branchId: 'branch-1',
    sourceLanguage: 'en',
    targetLanguages: ['ar', 'zh-Hans'],
    exportedAt: '2026-07-29T10:00:00.000Z',
    revisionWatermark: 'revision-7',
    contractSetHash: 'contract-set-1',
    entries: [
      {
        key: 'welcome',
        namespace: 'home',
        kind: 'ui',
        sourceText: 'Welcome, "{name}"!\nStart here 👋',
        keyVersionId: 'version-1',
        sourceHash: 'source-1',
        contractHash: 'contract-1',
        argumentSignature: 'name:string',
        description: 'Homepage greeting',
        format: 'icu',
        translations: {
          ar: {
            text: 'مرحبًا، "{name}"!\nابدأ هنا 👋',
            state: 'reviewed',
            note: 'راجعه الفريق، نهائي',
          },
          'zh-Hans': {
            text: '欢迎，“{name}”！\n从这里开始 👋',
            state: 'machine',
            note: 'Needs "tone" review',
          },
        },
      },
    ],
  };
}

describe('translation CSV adapter', () => {
  it('round-trips every version, source, state, and note column', async () => {
    const input = versionedDocument();
    const serialized = await translationCsvAdapter.serialize(input);

    expect(serialized.fileName).toBe('translations.csv');
    expect(serialized.mediaType).toBe('text/csv;charset=utf-8');
    expect(translationCsvAdapter.sniff(serialized.body)).toBe(true);
    await expect(translationCsvAdapter.parse(serialized.body)).resolves.toEqual(
      input,
    );
  });

  it('preserves quoted multilingual values, Unicode, and embedded newlines', async () => {
    const serialized = await translationCsvAdapter.serialize(versionedDocument());
    const text = decoder.decode(serialized.body);

    expect(text).toContain('""{name}""');
    expect(text).toContain('مرحبًا');
    expect(text).toContain('欢迎');
    expect(text).toContain('👋');

    const parsed = await translationCsvAdapter.parse(serialized.body);
    expect(parsed.entries[0]?.sourceText).toBe(
      'Welcome, "{name}"!\nStart here 👋',
    );
    expect(parsed.entries[0]?.translations.ar?.text).toBe(
      'مرحبًا، "{name}"!\nابدأ هنا 👋',
    );
    expect(parsed.entries[0]?.translations['zh-Hans']?.text).toBe(
      '欢迎，“{name}”！\n从这里开始 👋',
    );
  });

  it.each(['=', '+', '-', '@', '\t', '\r'])(
    'protects and reverses spreadsheet formula prefix %j',
    async (prefix) => {
      const input = versionedDocument();
      input.entries[0]!.sourceText = `${prefix}HYPERLINK("bad")`;
      input.entries[0]!.translations.ar!.text = `${prefix}SUM(1,2)`;

      const serialized = await translationCsvAdapter.serialize(input);
      const text = decoder.decode(serialized.body);
      expect(text).toContain(`'${prefix}`);

      const parsed = await translationCsvAdapter.parse(serialized.body);
      expect(parsed.entries[0]?.sourceText).toBe(
        `${prefix}HYPERLINK("bad")`,
      );
      expect(parsed.entries[0]?.translations.ar?.text).toBe(
        `${prefix}SUM(1,2)`,
      );
    },
  );

  it('does not confuse a literal apostrophe with an escaped formula', async () => {
    const input = versionedDocument();
    input.entries[0]!.sourceText = `'=a literal`;
    const parsed = await translationCsvAdapter.parse(
      (await translationCsvAdapter.serialize(input)).body,
    );
    expect(parsed.entries[0]?.sourceText).toBe(`'=a literal`);
  });

  it('rejects duplicate key/language rows instead of using the last value', async () => {
    const serialized = await translationCsvAdapter.serialize(versionedDocument());
    const text = decoder.decode(serialized.body);
    const rows = text.split('\r\n');
    const duplicate = encoder.encode(`${text}\r\n${rows[1]}`);

    await expect(translationCsvAdapter.parse(duplicate)).rejects.toThrow(
      'Duplicate translation entry for "welcome" in ar.',
    );
  });

  it('keeps a foreign CSV without version columns unverified', async () => {
    const columns = [
      'sourceLanguage',
      'targetLanguage',
      'key',
      'namespace',
      'kind',
      'sourceText',
      'targetText',
      'state',
      'note',
      'description',
      'format',
    ];
    const input = encoder.encode(
      [
        columns.join(','),
        'en,pt-br,welcome,home,ui,Welcome,Bem-vindo,reviewed,,,simple',
      ].join('\n'),
    );

    const parsed = await translationCsvAdapter.parse(input);
    expect(parsed.targetLanguages).toEqual(['pt-BR']);
    expect(parsed.entries[0]).toMatchObject({
      key: 'welcome',
      sourceText: 'Welcome',
      translations: {
        'pt-BR': { text: 'Bem-vindo', state: 'reviewed' },
      },
    });
    expect(parsed.entries[0]?.keyVersionId).toBeUndefined();
    expect(parsed.entries[0]?.sourceHash).toBeUndefined();
    expect(parsed.entries[0]?.contractHash).toBeUndefined();
    expect(parsed.entries[0]?.argumentSignature).toBeUndefined();
  });

  it('uses the documented deterministic schema and row order', async () => {
    const input = versionedDocument();
    input.entries.push({
      ...input.entries[0]!,
      key: 'alpha',
      namespace: undefined,
      keyVersionId: 'version-2',
      translations: {
        ar: { text: '' },
        'zh-Hans': { text: '阿尔法' },
      },
    });
    const serialized = await translationCsvAdapter.serialize(input);
    const lines = decoder.decode(serialized.body).split('\r\n');

    expect(lines[0]).toBe(TRANSLATION_CSV_COLUMNS.join(','));
    expect(lines[1]).toContain(',alpha,');
    expect(lines[2]).toContain(',alpha,');
    expect(lines[3]).toContain(',welcome,');
    expect(lines[4]).toContain(',welcome,');
  });
});
