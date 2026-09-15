import { describe, expect, it } from 'vitest';
import {
  canonicalLanguageTag,
  classifyKeyVersion,
  createArgumentSignature,
  createMonotonicVersionId,
  deriveBackfillKeyVersion,
  deriveTranslationKeyVersionContract,
  sha256Hex,
} from '../src/key-version.js';

describe('translation key version contracts', () => {
  it('uses canonical, order-independent argument signatures', () => {
    expect(createArgumentSignature('Hello {name}, {n}', 'simple')).toBe(
      createArgumentSignature('{n} items for {name}', 'simple'),
    );
    expect(
      createArgumentSignature(
        '{n, plural, one {{name} has one} other {{name} has #}}',
        'icu',
      ),
    ).toBe('[["n",["plural"]],["name",["argument"]]]');
  });

  it('rejects invalid ICU source contracts', () => {
    expect(() =>
      createArgumentSignature('{n, plural, one {One}}', 'icu'),
    ).toThrow(/Cannot version invalid ICU source text/);
  });

  it('uses a locked SHA-256 implementation', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('separates source identity from runtime contract identity', async () => {
    const first = await deriveTranslationKeyVersionContract({
      sourceLanguage: 'EN-us',
      sourceText: 'Hello {name}',
      format: 'simple',
    });
    const wordingChange = await deriveTranslationKeyVersionContract({
      sourceLanguage: 'en-US',
      sourceText: 'Welcome {name}',
      format: 'simple',
    });
    expect(first.sourceLanguage).toBe('en-US');
    expect(first.sourceHash).not.toBe(wordingChange.sourceHash);
    expect(first.contractHash).toBe(wordingChange.contractHash);
  });

  it('derives the same migration version on every run', async () => {
    const input = {
      sourceLanguage: 'en',
      sourceText: '{n, plural, one {One mission} other {# missions}}',
      format: 'icu' as const,
    };
    expect(await deriveBackfillKeyVersion(input)).toEqual(
      await deriveBackfillKeyVersion(input),
    );
    expect((await deriveBackfillKeyVersion(input)).versionId).toMatch(
      /^backfill-[0-9a-f]{16}-[0-9a-f]{16}$/,
    );
  });

  it('validates source language tags', () => {
    expect(canonicalLanguageTag('pt-br')).toBe('pt-BR');
    expect(() => canonicalLanguageTag('not a language')).toThrow(
      /Invalid BCP-47/,
    );
  });

  it('classifies source, format, argument, and retirement changes', () => {
    const current = {
      sourceText: 'Hello {name}',
      format: 'simple' as const,
      argumentSignature: createArgumentSignature('Hello {name}', 'simple'),
    };
    expect(classifyKeyVersion(current, { ...current })).toEqual({
      action: 'unchanged',
      reason: 'same-source-and-contract',
    });
    expect(
      classifyKeyVersion(current, {
        sourceText: 'Welcome {name}',
        format: 'simple',
      }),
    ).toEqual({ action: 'create-version', reason: 'source-changed' });
    expect(
      classifyKeyVersion(current, {
        sourceText: 'Hello {name} {count}',
        format: 'simple',
      }),
    ).toEqual({
      action: 'create-version',
      reason: 'argument-contract-changed',
    });
    expect(
      classifyKeyVersion(current, {
        sourceText: '{name}',
        format: 'icu',
      }),
    ).toEqual({ action: 'create-version', reason: 'format-changed' });
    expect(classifyKeyVersion(current, undefined)).toEqual({
      action: 'retire',
      reason: 'missing-from-source',
    });
  });

  it('creates lexicographically monotonic ULIDs', () => {
    const first = createMonotonicVersionId(1_700_000_000_000, new Uint8Array(10));
    const second = createMonotonicVersionId(1_700_000_000_000);
    const third = createMonotonicVersionId(
      1_700_000_000_001,
      new Uint8Array(10).fill(1),
    );
    expect(first).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(first < second && second < third).toBe(true);
  });
});
