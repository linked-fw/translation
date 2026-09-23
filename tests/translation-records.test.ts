import { describe, expect, it } from 'vitest';
import { groupTranslationEntries } from '../src/shapes/TranslationProvider.js';

describe('groupTranslationEntries', () => {
  it('groups app-scoped query rows into deterministic plain records', () => {
    const result = groupTranslationEntries(
      [
        {
          key: 'nav.home',
          namespace: 'nav',
          sourceText: 'Home',
          kind: 'ui',
          format: 'simple',
        },
        {
          key: 'account.title',
          namespace: 'account',
          sourceText: 'Account',
          kind: 'ui',
          format: 'simple',
        },
      ],
      [
        {
          ofKey: { key: 'nav.home' },
          language: 'es',
          text: 'Inicio',
          state: 'reviewed',
        },
        {
          ofKey: { key: 'missing.key' },
          language: 'fr',
          text: 'Ignored',
          state: 'reviewed',
        },
      ],
    );

    expect(result.map((entry) => entry.key)).toEqual([
      'account.title',
      'nav.home',
    ]);
    expect(result[1].units.es).toEqual({
      language: 'es',
      text: 'Inicio',
      state: 'reviewed',
      updatedAt: undefined,
    });
  });

  it('normalizes unknown persisted states to untranslated', () => {
    const [entry] = groupTranslationEntries(
      [
        {
          key: 'nav.home',
          namespace: 'nav',
          sourceText: 'Home',
          kind: 'ui',
          format: 'simple',
        },
      ],
      [
        {
          ofKey: { key: 'nav.home' },
          language: 'de',
          text: '',
          state: 'legacy' as any,
        },
      ],
    );

    expect(entry.units.de.state).toBe('untranslated');
  });

  it('selects current-version units and exposes immutable version history', () => {
    const [entry] = groupTranslationEntries(
      [
        {
          key: 'nav.home',
          namespace: 'nav',
          sourceText: 'Welcome',
          kind: 'ui',
          format: 'simple',
          currentVersion: { id: 'version-2' },
        },
      ] as any,
      [
        {
          ofKey: { key: 'nav.home' },
          ofKeyVersion: { id: 'version-1' },
          language: 'es',
          text: 'Inicio',
          state: 'reviewed',
        },
        {
          ofKey: { key: 'nav.home' },
          ofKeyVersion: { id: 'version-2' },
          language: 'es',
          text: 'Bienvenido',
          state: 'machine',
        },
      ],
      [
        {
          id: 'version-1',
          ofKey: { key: 'nav.home' },
          versionId: '01OLD',
          sourceLanguage: 'en',
          sourceText: 'Home',
          format: 'simple',
          argumentSignature: '[]',
          contractHash: 'contract',
          sourceHash: 'old-source',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 'version-2',
          ofKey: { key: 'nav.home' },
          versionId: '01NEW',
          sourceLanguage: 'en',
          sourceText: 'Welcome',
          format: 'simple',
          argumentSignature: '[]',
          contractHash: 'contract',
          sourceHash: 'new-source',
          supersedes: { id: 'version-1' },
          createdAt: '2026-07-02T00:00:00.000Z',
        },
      ] as any,
    );

    expect(entry.currentVersion?.id).toBe('version-2');
    expect(entry.versions?.map(({ id }) => id)).toEqual([
      'version-2',
      'version-1',
    ]);
    expect(entry.units.es).toMatchObject({
      text: 'Bienvenido',
      state: 'machine',
      keyVersionId: 'version-2',
    });
  });

  it('shows a prior-version unit as stale until the new version is translated', () => {
    const [entry] = groupTranslationEntries(
      [
        {
          key: 'nav.home',
          namespace: 'nav',
          sourceText: 'Welcome',
          kind: 'ui',
          format: 'simple',
          currentVersion: { id: 'version-2' },
        },
      ] as any,
      [
        {
          ofKey: { key: 'nav.home' },
          ofKeyVersion: { id: 'version-1' },
          language: 'fr',
          text: 'Accueil',
          state: 'reviewed',
        },
      ],
      [
        {
          id: 'version-2',
          ofKey: { key: 'nav.home' },
          versionId: '01NEW',
          sourceLanguage: 'en',
          sourceText: 'Welcome',
          format: 'simple',
          argumentSignature: '[]',
          contractHash: 'contract',
          sourceHash: 'new-source',
        },
      ] as any,
    );
    expect(entry.units.fr.state).toBe('stale');
  });
});
