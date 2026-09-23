import { describe, expect, it } from 'vitest';
import type { TranslationKeyVersionRecord } from '../src/records.js';
import {
  classifyTranslationMemoryMatches,
  findExactMemoryPretranslations,
  toTranslationMemoryRecords,
} from '../src/shapes/TranslationProvider.js';

const current: TranslationKeyVersionRecord = {
  id: 'version-current',
  versionId: 'current',
  sourceLanguage: 'en',
  sourceText: 'Welcome',
  format: 'simple',
  argumentSignature: '[]',
  contractHash: 'contract',
  sourceHash: 'source-current',
};

describe('translation memory and carry-forward classification', () => {
  it('offers exact source matches across keys and sorts them first', () => {
    const matches = classifyTranslationMemoryMatches({
      key: 'nav.welcome',
      language: 'es',
      currentVersion: current,
      rows: [
        {
          id: 'carry-unit',
          language: 'es',
          text: 'Bienvenido anterior',
          state: 'reviewed',
          updatedAt: '2026-07-28T10:00:00.000Z',
          ofKey: { key: 'nav.welcome' },
          ofKeyVersion: {
            id: 'version-old',
            sourceText: 'Welcome back',
            sourceHash: 'source-old',
            contractHash: 'contract',
          },
        },
        {
          id: 'exact-unit',
          language: 'es',
          text: 'Bienvenido',
          state: 'reviewed',
          updatedAt: '2026-07-27T10:00:00.000Z',
          ofKey: { key: 'dialog.welcome' },
          ofKeyVersion: {
            id: 'version-other-key',
            sourceText: 'Welcome',
            sourceHash: 'source-current',
            contractHash: 'contract',
          },
        },
      ],
    });

    expect(matches.map(({ kind, unitId }) => [kind, unitId])).toEqual([
      ['exact', 'exact-unit'],
      ['carry-forward', 'carry-unit'],
    ]);
  });

  it('rejects changed-source matches from another key and incompatible contracts', () => {
    const matches = classifyTranslationMemoryMatches({
      key: 'nav.welcome',
      language: 'es',
      currentVersion: current,
      rows: [
        {
          id: 'unsafe-cross-key',
          language: 'es',
          text: 'Otro',
          state: 'reviewed',
          ofKey: { key: 'other.key' },
          ofKeyVersion: {
            id: 'version-other',
            sourceText: 'Another source',
            sourceHash: 'another-source',
            contractHash: 'contract',
          },
        },
        {
          id: 'incompatible',
          language: 'es',
          text: 'Hola {name}',
          state: 'reviewed',
          ofKey: { key: 'nav.welcome' },
          ofKeyVersion: {
            id: 'version-incompatible',
            sourceText: 'Welcome {name}',
            sourceHash: 'source-name',
            contractHash: 'different-contract',
          },
        },
      ],
    });

    expect(matches).toEqual([]);
  });

  it('only indexes reviewed, non-empty translations from prior versions', () => {
    const matches = classifyTranslationMemoryMatches({
      key: 'nav.welcome',
      language: 'es',
      currentVersion: current,
      rows: [
        {
          id: 'machine',
          language: 'es',
          text: 'Máquina',
          state: 'machine',
          ofKey: { key: 'nav.welcome' },
          ofKeyVersion: {
            id: 'old-machine',
            sourceHash: 'source-current',
            contractHash: 'contract',
          },
        },
        {
          id: 'current',
          language: 'es',
          text: 'Actual',
          state: 'reviewed',
          ofKey: { key: 'nav.welcome' },
          ofKeyVersion: {
            id: 'version-current',
            sourceHash: 'source-current',
            contractHash: 'contract',
          },
        },
      ],
    });

    expect(matches).toEqual([]);
  });

  it('indexes only reviewed units for the searchable memory browser', () => {
    const records = toTranslationMemoryRecords([
      {
        id: 'reviewed-unit',
        language: 'es',
        text: 'Bienvenido',
        state: 'reviewed',
        updatedAt: '2026-07-28T12:00:00.000Z',
        ofKey: { key: 'dialog.welcome' },
        ofKeyVersion: {
          id: 'version-reviewed',
          sourceText: 'Welcome',
          sourceHash: 'source-current',
          contractHash: 'contract',
        },
      },
      {
        id: 'machine-unit',
        language: 'es',
        text: 'Máquina',
        state: 'machine',
        ofKey: { key: 'dialog.machine' },
        ofKeyVersion: {
          id: 'version-machine',
          sourceText: 'Machine',
          sourceHash: 'machine',
          contractHash: 'contract',
        },
      },
    ]);

    expect(records).toEqual([
      expect.objectContaining({
        unitId: 'reviewed-unit',
        key: 'dialog.welcome',
        language: 'es',
        text: 'Bienvenido',
      }),
    ]);
  });

  it('pretranslates only empty current cells with exact source and contract hashes', () => {
    const candidates = findExactMemoryPretranslations({
      language: 'es',
      entries: [
        {
          key: 'nav.welcome',
          namespace: 'nav',
          sourceText: 'Welcome',
          kind: 'ui',
          format: 'simple',
          currentVersion: current,
          units: {},
        },
        {
          key: 'nav.saved',
          namespace: 'nav',
          sourceText: 'Welcome',
          kind: 'ui',
          format: 'simple',
          currentVersion: { ...current, id: 'saved-current' },
          units: {
            es: { language: 'es', text: 'Guardado', state: 'reviewed' },
          },
        },
        {
          key: 'nav.incompatible',
          namespace: 'nav',
          sourceText: 'Welcome',
          kind: 'ui',
          format: 'simple',
          currentVersion: {
            ...current,
            id: 'incompatible-current',
            contractHash: 'other-contract',
          },
          units: {},
        },
      ],
      memory: [
        {
          unitId: 'reviewed-unit',
          key: 'dialog.welcome',
          language: 'es',
          text: 'Bienvenido',
          keyVersionId: 'version-reviewed',
          sourceText: 'Welcome',
          sourceHash: 'source-current',
          contractHash: 'contract',
          updatedAt: '2026-07-28T12:00:00.000Z',
        },
      ],
    });

    expect(candidates).toEqual([
      {
        key: 'nav.welcome',
        language: 'es',
        unitId: 'reviewed-unit',
        sourceKey: 'dialog.welcome',
        text: 'Bienvenido',
      },
    ]);
  });
});
