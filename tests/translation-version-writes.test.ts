import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranslationKey } from '../src/shapes/TranslationKey.js';
import { TranslationKeyVersion } from '../src/shapes/TranslationKeyVersion.js';
import { TranslationRevision } from '../src/shapes/TranslationRevision.js';
import { TranslationUnit } from '../src/shapes/TranslationUnit.js';
import {
  upsertTranslationKey,
  upsertTranslationUnit,
} from '../src/shapes/TranslationProvider.js';

const APP = 'https://example.test/app';
const KEY_ID = `${APP}/translation/key/nav.home`;
const CURRENT_ID = `${KEY_ID}/version/01CURRENT`;

const oneResult = (value: unknown) =>
  ({
    where: () => ({
      one: () => Promise.resolve(value),
    }),
  }) as any;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('translation version dual-write', () => {
  const existingDeclared = (extra: Record<string, unknown> = {}) => {
    vi.spyOn(TranslationKey, 'select').mockReturnValue(
      oneResult({
        sourceText: 'Home',
        format: 'simple',
        currentVersion: { id: CURRENT_ID },
        ofResource: { id: 'https://package.example/help' },
        fromPackage: '@foreign/help',
        ...extra,
      })
    );
    vi.spyOn(TranslationKeyVersion, 'select').mockReturnValue(
      oneResult({
        id: CURRENT_ID,
        versionId: '01CURRENT',
        sourceLanguage: 'en',
        sourceText: 'Home',
        format: 'simple',
        argumentSignature: '[]',
        contractHash: 'contract',
        sourceHash: 'source',
      })
    );
    const update = vi
      .spyOn(TranslationKey, 'update')
      .mockReturnValue({ for: vi.fn().mockResolvedValue({}) } as any);
    const create = vi
      .spyOn(TranslationKey, 'create')
      .mockResolvedValue({} as any);
    const version = vi
      .spyOn(TranslationKeyVersion, 'create')
      .mockResolvedValue({} as any);
    const stale = vi
      .spyOn(TranslationUnit, 'update')
      .mockReturnValue({ where: vi.fn().mockResolvedValue({}) } as any);
    return { update, create, version, stale };
  };

  it('marks an explicit app edit of package resource help as an override and snapshots its canonical source', async () => {
    const calls = existingDeclared();
    await upsertTranslationKey({
      appId: APP,
      key: 'nav.home',
      sourceText: 'Our own wording',
    });
    expect(calls.update).toHaveBeenCalledWith(
      expect.objectContaining({
        overridden: true,
        shapeSource: 'Home',
        sourceText: 'Our own wording',
      })
    );
    expect(calls.version).toHaveBeenCalledOnce();
  });

  it('declaration refresh updates unmodified package help without misclassifying it as a local edit', async () => {
    const calls = existingDeclared();
    await upsertTranslationKey(
      { appId: APP, key: 'nav.home', sourceText: 'Updated package help' },
      { source: 'declaration-sync' }
    );
    expect(calls.update).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceText: 'Updated package help',
        overridden: undefined,
      })
    );
    expect(calls.update.mock.calls[0]![0]).not.toHaveProperty('shapeSource');
  });

  it('preserves an app-owned message-format edit even when the source wording is unchanged', async () => {
    const calls = existingDeclared();
    await upsertTranslationKey({
      appId: APP,
      key: 'nav.home',
      sourceText: 'Home',
      format: 'icu',
    });
    expect(calls.update).toHaveBeenCalledWith(
      expect.objectContaining({
        overridden: true,
        shapeSource: 'Home',
        format: 'icu',
      })
    );
  });

  it('package refresh preserves an app override with zero writes even if the incoming payload asks to clear it', async () => {
    const calls = existingDeclared({ overridden: true });
    const result = await upsertTranslationKey(
      {
        appId: APP,
        key: 'nav.home',
        sourceText: 'New package wording',
        overridden: false,
      },
      { source: 'declaration-sync' }
    );
    expect(result).toEqual({
      id: KEY_ID,
      versionId: CURRENT_ID,
      versionCreated: false,
      preservedOverride: true,
    });
    for (const call of Object.values(calls))
      expect(call).not.toHaveBeenCalled();
  });

  it('later local edits keep the original source snapshot; an explicit author reset can clear the flag', async () => {
    const calls = existingDeclared({ overridden: true });
    await upsertTranslationKey({
      appId: APP,
      key: 'nav.home',
      sourceText: 'A later edit',
    });
    expect(calls.update.mock.calls[0]![0]).not.toHaveProperty('shapeSource');
    await upsertTranslationKey({
      appId: APP,
      key: 'nav.home',
      sourceText: 'Canonical again',
      overridden: false,
    });
    expect(calls.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ overridden: false })
    );
  });

  it('refuses refreshing an overridden legacy key without a current version rather than guessing a replacement', async () => {
    const calls = existingDeclared({
      overridden: true,
      currentVersion: undefined,
    });
    await expect(
      upsertTranslationKey(
        { appId: APP, key: 'nav.home', sourceText: 'Package' },
        { source: 'declaration-sync' }
      )
    ).rejects.toThrow(/no current version/);
    for (const call of Object.values(calls))
      expect(call).not.toHaveBeenCalled();
  });

  it('a failed source read is not treated as permission to create or overwrite a key', async () => {
    const calls = existingDeclared();
    vi.mocked(TranslationKey.select).mockReturnValue({
      where: () => ({
        one: () => Promise.reject(new Error('source read failed')),
      }),
    } as any);
    await expect(
      upsertTranslationKey(
        { appId: APP, key: 'nav.home', sourceText: 'Package' },
        { source: 'declaration-sync' }
      )
    ).rejects.toThrow('source read failed');
    for (const call of Object.values(calls))
      expect(call).not.toHaveBeenCalled();
  });
  it('creates a first version and then advances the logical-key pointer', async () => {
    vi.spyOn(TranslationKey, 'select').mockReturnValue(oneResult(null));
    const createKey = vi
      .spyOn(TranslationKey, 'create')
      .mockResolvedValue({} as any);
    const updateFor = vi.fn().mockResolvedValue({});
    vi.spyOn(TranslationKey, 'update').mockReturnValue({
      for: updateFor,
    } as any);
    const createVersion = vi
      .spyOn(TranslationKeyVersion, 'create')
      .mockResolvedValue({} as any);

    const result = await upsertTranslationKey({
      appId: APP,
      key: 'nav.home',
      sourceText: 'Home',
      format: 'simple',
    });

    expect(result.versionCreated).toBe(true);
    expect(createKey).toHaveBeenCalledOnce();
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        ofKey: { id: KEY_ID },
        sourceText: 'Home',
        argumentSignature: '[]',
        createdAt: expect.any(Date),
      }),
    );
    expect(updateFor).toHaveBeenCalledWith({ id: KEY_ID });
  });

  it('creates a superseding version and stales prior units on source drift', async () => {
    vi.spyOn(TranslationKey, 'select').mockReturnValue(
      oneResult({
        sourceText: 'Home',
        format: 'simple',
        currentVersion: { id: CURRENT_ID },
      }),
    );
    vi.spyOn(TranslationKeyVersion, 'select').mockReturnValue(
      oneResult({
        id: CURRENT_ID,
        versionId: '01CURRENT',
        sourceLanguage: 'en',
        sourceText: 'Home',
        format: 'simple',
        argumentSignature: '[]',
        contractHash: 'contract',
        sourceHash: 'source',
      }),
    );
    const createVersion = vi
      .spyOn(TranslationKeyVersion, 'create')
      .mockResolvedValue({} as any);
    vi.spyOn(TranslationKey, 'update').mockReturnValue({
      for: vi.fn().mockResolvedValue({}),
    } as any);
    const staleWhere = vi.fn().mockResolvedValue({});
    vi.spyOn(TranslationUnit, 'update').mockReturnValue({
      where: staleWhere,
    } as any);

    const result = await upsertTranslationKey({
      appId: APP,
      key: 'nav.home',
      sourceText: 'Welcome',
      format: 'simple',
    });

    expect(result.versionCreated).toBe(true);
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceText: 'Welcome',
        supersedes: { id: CURRENT_ID },
      }),
    );
    expect(staleWhere).toHaveBeenCalledOnce();
  });

  it('does not create a version when source and contract are unchanged', async () => {
    vi.spyOn(TranslationKey, 'select').mockReturnValue(
      oneResult({
        sourceText: 'Home',
        format: 'simple',
        currentVersion: { id: CURRENT_ID },
      }),
    );
    vi.spyOn(TranslationKeyVersion, 'select').mockReturnValue(
      oneResult({
        id: CURRENT_ID,
        versionId: '01CURRENT',
        sourceLanguage: 'en',
        sourceText: 'Home',
        format: 'simple',
        argumentSignature: '[]',
        contractHash: 'contract',
        sourceHash: 'source',
      }),
    );
    const createVersion = vi.spyOn(TranslationKeyVersion, 'create');
    vi.spyOn(TranslationKey, 'update').mockReturnValue({
      for: vi.fn().mockResolvedValue({}),
    } as any);
    const stale = vi.spyOn(TranslationUnit, 'update');

    const result = await upsertTranslationKey({
      appId: APP,
      key: 'nav.home',
      sourceText: 'Home',
      format: 'simple',
    });

    expect(result.versionCreated).toBe(false);
    expect(createVersion).not.toHaveBeenCalled();
    expect(stale).not.toHaveBeenCalled();
  });

  it('writes units and revisions against the current key version', async () => {
    vi.spyOn(TranslationKey, 'select').mockReturnValue(
      oneResult({
        sourceText: 'Home',
        format: 'simple',
        currentVersion: { id: CURRENT_ID },
      }),
    );
    vi.spyOn(TranslationKeyVersion, 'select').mockReturnValue(
      oneResult({
        id: CURRENT_ID,
        versionId: '01CURRENT',
        sourceLanguage: 'en',
        sourceText: 'Home',
        format: 'simple',
        argumentSignature: '[]',
        contractHash: 'contract',
        sourceHash: 'source',
      }),
    );
    vi.spyOn(TranslationUnit, 'select').mockReturnValue(oneResult(null));
    const createUnit = vi
      .spyOn(TranslationUnit, 'create')
      .mockResolvedValue({} as any);
    const createRevision = vi
      .spyOn(TranslationRevision, 'create')
      .mockResolvedValue({} as any);

    await upsertTranslationUnit({
      appId: APP,
      key: 'nav.home',
      language: 'es',
      text: 'Inicio',
      state: 'reviewed',
    });

    expect(createUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        ofKey: { id: KEY_ID },
        ofKeyVersion: { id: CURRENT_ID },
        language: 'es',
        updatedAt: expect.any(Date),
      }),
    );
    expect(createRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        ofKeyVersion: { id: CURRENT_ID },
        text: 'Inicio',
        createdAt: expect.any(Date),
      }),
    );
  });
});
