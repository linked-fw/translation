import { afterEach, describe, expect, it } from 'vitest';
import {
  clearTranslationFormatAdapters,
  getTranslationFormatAdapter,
  listTranslationFormatAdapters,
  normalizeParsedTranslationExchangeDocument,
  registerTranslationFormatAdapter,
  validateTranslationExchangeDocument,
  type TranslationExchangeDocument,
  type TranslationFormatAdapter,
} from '../src/exchange.js';

const sourceHash = 'a'.repeat(64);
const contractHash = 'b'.repeat(64);

const document = (): TranslationExchangeDocument => ({
  schemaVersion: 1,
  appId: 'app',
  branchId: 'branch',
  sourceLanguage: 'EN-us',
  targetLanguages: ['pt-br'],
  entries: [
    {
      key: 'cart.items',
      namespace: 'cart',
      kind: 'ui',
      sourceText:
        '{count, plural, one {# item} other {# items}}',
      keyVersionId: 'https://example.test/key/cart.items/version/01',
      sourceHash,
      contractHash,
      argumentSignature: '[["count",["plural"]]]',
      format: 'icu',
      translations: {
        'pt-br': {
          text: '{count, plural, one {# item} other {# itens}}',
          state: 'reviewed',
        },
      },
    },
  ],
});

describe('translation exchange contracts', () => {
  afterEach(() => clearTranslationFormatAdapters());

  it('normalizes a canonical Create Now exchange document', () => {
    const normalized = validateTranslationExchangeDocument(document());
    expect(normalized.sourceLanguage).toBe('en-US');
    expect(normalized.targetLanguages).toEqual(['pt-BR']);
    expect(normalized.entries[0]).toMatchObject({
      key: 'cart.items',
      sourceText: '{count, plural, one {# item} other {# items}}',
      keyVersionId: 'https://example.test/key/cart.items/version/01',
      sourceHash,
      contractHash,
      argumentSignature: '[["count",["plural"]]]',
      format: 'icu',
    });
    expect(normalized.entries[0].translations['pt-BR'].state).toBe(
      'reviewed',
    );
  });

  it.each([
    'sourceText',
    'keyVersionId',
    'sourceHash',
    'contractHash',
    'argumentSignature',
  ] as const)('rejects a Create Now export missing %s', (field) => {
    const input = document() as any;
    delete input.entries[0][field];
    expect(() => validateTranslationExchangeDocument(input)).toThrow(
      `entries[0].${field} is required`,
    );
  });

  it('keeps a foreign parsed document unverified without inventing evidence', () => {
    const input = document() as any;
    delete input.entries[0].sourceText;
    delete input.entries[0].keyVersionId;
    delete input.entries[0].sourceHash;
    delete input.entries[0].contractHash;
    delete input.entries[0].argumentSignature;

    const parsed = normalizeParsedTranslationExchangeDocument(input);
    expect(parsed.entries[0].key).toBe('cart.items');
    expect(parsed.entries[0].sourceText).toBeUndefined();
    expect(parsed.entries[0].keyVersionId).toBeUndefined();
    expect(() => validateTranslationExchangeDocument(input)).toThrow(
      'sourceText is required',
    );
  });

  it('registers format adapters explicitly and rejects duplicate keys', () => {
    const adapter: TranslationFormatAdapter = {
      format: 'csv',
      sniff: () => true,
      parse: async () => normalizeParsedTranslationExchangeDocument(document()),
      serialize: async () => ({
        fileName: 'translations.csv',
        mediaType: 'text/csv',
        body: new Uint8Array(),
      }),
    };
    registerTranslationFormatAdapter(adapter);
    expect(getTranslationFormatAdapter('csv')).toBe(adapter);
    expect(listTranslationFormatAdapters()).toEqual([adapter]);
    expect(() => registerTranslationFormatAdapter(adapter)).toThrow(
      'already registered',
    );
  });

  it('rejects duplicate canonical key-language entries', () => {
    const input = document();
    input.entries.push({
      ...input.entries[0],
      translations: {
        'pt-BR': { text: 'Itens', state: 'machine' },
      },
    });
    expect(() => normalizeParsedTranslationExchangeDocument(input)).toThrow(
      'Duplicate translation entry',
    );
  });
});
