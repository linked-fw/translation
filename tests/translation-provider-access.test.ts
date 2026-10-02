import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canAuthorTranslation,
  configureTranslationAuthorization,
  type TranslationAuthorizationRequest,
} from '../src/authorization.js';
import { GlossaryTerm } from '../src/shapes/GlossaryTerm.js';
import { TranslationKey } from '../src/shapes/TranslationKey.js';
import { TranslationKeyVersion } from '../src/shapes/TranslationKeyVersion.js';
import { TranslationProvider } from '../src/shapes/TranslationProvider.js';
import { TranslationRelease } from '../src/shapes/TranslationRelease.js';
import { TranslationRevision } from '../src/shapes/TranslationRevision.js';
import { TranslationUnit } from '../src/shapes/TranslationUnit.js';

const APP = 'https://example.test/app';
const OTHER_APP = 'https://example.test/other-app';
const ALICE = 'https://webid.example/alice';
const RELEASE_ID = `${APP}/translation/release/r1`;

/** A query builder stand-in: every chained call returns itself; it resolves to `rows`. */
function query(rows: unknown, one: unknown = null): any {
  const chain: any = {
    where: () => chain,
    one: () => Promise.resolve(one),
    then: (resolve: any, reject: any) =>
      Promise.resolve(rows).then(resolve, reject),
    catch: (reject: any) => Promise.resolve(rows).catch(reject),
  };
  return chain;
}

function stubStore(): void {
  for (const shape of [
    TranslationKey,
    TranslationKeyVersion,
    TranslationUnit,
    TranslationRevision,
    TranslationRelease,
    GlossaryTerm,
  ] as any[]) {
    vi.spyOn(shape, 'select').mockReturnValue(query([]));
    vi.spyOn(shape, 'create').mockResolvedValue({});
    vi.spyOn(shape, 'update').mockReturnValue({
      for: vi.fn().mockResolvedValue({}),
    } as any);
    if (typeof shape.delete === 'function') {
      vi.spyOn(shape, 'delete').mockResolvedValue({});
    }
  }
}

function provider(linkedAuth?: unknown): TranslationProvider {
  const instance = new TranslationProvider(undefined as any, undefined as any);
  (instance as any).request = linkedAuth ? { linkedAuth } : {};
  return instance;
}

const signedIn = () => provider({ userAccount: { accountOf: { id: ALICE } } });

const releaseInput = {
  appId: APP,
  releaseId: 'r1',
  branchId: `${APP}/branch/main`,
  channel: 'preview' as const,
  status: 'draft' as const,
  contractSetHash: 'c',
  manifestHash: 'm',
  hotfixSequence: 0,
};

/** Every gated method, the action it must ask the resolver for, and a valid call. */
const GATED: Array<{
  method: string;
  action: TranslationAuthorizationRequest['action'];
  args: any;
}> = [
  { method: 'upsertKey', action: 'manage', args: { appId: APP, key: 'nav.home', sourceText: 'Home' } },
  { method: 'createRelease', action: 'manage', args: releaseInput },
  {
    method: 'advanceReleaseHotfix',
    action: 'manage',
    args: { id: RELEASE_ID, expectedSequence: 0, hotfixSequence: 1, manifestHash: 'm2' },
  },
  { method: 'listKeys', action: 'read', args: { appId: APP } },
  { method: 'listEntries', action: 'read', args: { appId: APP } },
  { method: 'listKeyVersions', action: 'read', args: { appId: APP } },
  { method: 'listMemoryMatches', action: 'read', args: { appId: APP, key: 'nav.home', language: 'es' } },
  { method: 'listMemory', action: 'read', args: { appId: APP } },
  { method: 'listReleases', action: 'read', args: { appId: APP } },
  { method: 'listGlossary', action: 'read', args: { appId: APP } },
  { method: 'listRevisions', action: 'read', args: { appId: APP, key: 'nav.home', language: 'es' } },
  { method: 'listProposals', action: 'read', args: { appId: APP } },
];

/** Methods that were already behind the resolver; they must stay there. */
const ALREADY_GATED = [
  { method: 'proposeRevision', args: { appId: APP, key: 'k', language: 'es', text: 't' } },
  { method: 'decideProposal', args: { appId: APP, revisionId: 'x', decision: 'accept' } },
  { method: 'pretranslateMemory', args: { appId: APP, language: 'es' } },
  { method: 'applyMemoryMatch', args: { appId: APP, key: 'k', language: 'es', unitId: 'u' } },
  { method: 'upsertUnit', args: { appId: APP, key: 'k', language: 'es', text: 't' } },
  { method: 'upsertGlossaryTerm', args: { appId: APP, term: 't' } },
  { method: 'deleteGlossaryTerm', args: { appId: APP, id: `${APP}/translation/glossary/t--all` } },
];

beforeEach(() => {
  stubStore();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  configureTranslationAuthorization(undefined);
  vi.restoreAllMocks();
});

describe('TranslationProvider access gates', () => {
  it.each([...GATED, ...ALREADY_GATED])(
    '$method rejects an anonymous caller with 401',
    async ({ method, args }) => {
      const resolver = vi.fn().mockResolvedValue(true);
      configureTranslationAuthorization(resolver);
      await expect((provider() as any)[method](args)).rejects.toMatchObject({
        name: 'ServerCallError',
        status: 401,
      });
      expect(resolver).not.toHaveBeenCalled();
    },
  );

  it.each(GATED)(
    '$method rejects a signed-in caller the resolver denies',
    async ({ method, action, args }) => {
      const resolver = vi.fn().mockResolvedValue(false);
      configureTranslationAuthorization(resolver);
      await expect((signedIn() as any)[method](args)).rejects.toThrow(
        `Translation ${action} permission required.`,
      );
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ appId: APP, actorWebId: ALICE, action }),
      );
    },
  );

  it.each(GATED)(
    '$method runs for a signed-in caller the resolver grants',
    async ({ method, action, args }) => {
      if (method === 'advanceReleaseHotfix') {
        vi.spyOn(TranslationRelease, 'select').mockReturnValue(
          query([], {
            id: RELEASE_ID,
            releaseId: 'r1',
            ofApplication: { id: APP },
            branch: { id: `${APP}/branch/main` },
            hotfixSequence: 0,
          }),
        );
      }
      const resolver = vi.fn().mockResolvedValue(true);
      configureTranslationAuthorization(resolver);
      await expect((signedIn() as any)[method](args)).resolves.toBeDefined();
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ appId: APP, actorWebId: ALICE, action }),
      );
    },
  );

  it.each([...GATED, ...ALREADY_GATED])(
    '$method is denied when the host configured no resolver',
    async ({ method, args }) => {
      await expect((signedIn() as any)[method](args)).rejects.toThrow(
        /permission required/,
      );
    },
  );

  it('getMessages stays public', async () => {
    await expect(
      (provider() as any).getMessages({ appId: APP, language: 'es' }),
    ).resolves.toEqual({});
  });

  it('advanceReleaseHotfix asks about the app the release id belongs to', async () => {
    const resolver = vi.fn(async (request: TranslationAuthorizationRequest) =>
      request.appId === OTHER_APP,
    );
    configureTranslationAuthorization(resolver);
    // A manager of OTHER_APP cannot pass OTHER_APP alongside APP's release id.
    await expect(
      (signedIn() as any).advanceReleaseHotfix({
        appId: OTHER_APP,
        id: RELEASE_ID,
        expectedSequence: 0,
        hotfixSequence: 1,
        manifestHash: 'm2',
      }),
    ).rejects.toThrow('Translation manage permission required.');
    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({ appId: APP, action: 'manage' }),
    );
  });

  it('advanceReleaseHotfix refuses a release stored under another app', async () => {
    configureTranslationAuthorization(async () => true);
    vi.spyOn(TranslationRelease, 'select').mockReturnValue(
      query([], {
        id: RELEASE_ID,
        releaseId: 'r1',
        ofApplication: { id: OTHER_APP },
        branch: { id: `${OTHER_APP}/branch/main` },
        hotfixSequence: 0,
      }),
    );
    await expect(
      (signedIn() as any).advanceReleaseHotfix({
        id: RELEASE_ID,
        expectedSequence: 0,
        hotfixSequence: 1,
        manifestHash: 'm2',
      }),
    ).rejects.toThrow('was not found');
  });

  it('advanceReleaseHotfix rejects an id that is not a release id', async () => {
    configureTranslationAuthorization(async () => true);
    await expect(
      (signedIn() as any).advanceReleaseHotfix({
        id: 'https://example.test/whatever',
        expectedSequence: 0,
        hotfixSequence: 1,
        manifestHash: 'm2',
      }),
    ).rejects.toThrow('Not a translation release id.');
  });

  it('decideProposal checks review access before it reads the proposal', async () => {
    const resolver = vi.fn().mockResolvedValue(false);
    configureTranslationAuthorization(resolver);
    const select = vi.spyOn(TranslationRevision, 'select');
    await expect(
      (signedIn() as any).decideProposal({
        appId: APP,
        revisionId: 'x',
        decision: 'accept',
      }),
    ).rejects.toThrow('Translation review permission required.');
    expect(select).not.toHaveBeenCalled();
  });

  it('records the caller resolved before the first await, not a later request', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const seen: string[] = [];
    configureTranslationAuthorization(async (request) => {
      seen.push(request.actorWebId);
      await gate;
      return true;
    });
    const instance = signedIn();
    const pending = (instance as any).upsertKey({
      appId: APP,
      key: 'nav.home',
      sourceText: 'Home',
    });
    // Another call re-points the shared provider's request while this one waits.
    (instance as any).request = {
      linkedAuth: { userAccount: { accountOf: { id: 'https://webid.example/mallory' } } },
    };
    release();
    await pending;
    expect(seen).toEqual([ALICE]);
    expect(TranslationKeyVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: { id: ALICE } }),
    );
  });
});

describe('canAuthorTranslation', () => {
  const request: TranslationAuthorizationRequest = {
    appId: APP,
    actorWebId: ALICE,
    action: 'read',
  };

  it('denies when no resolver is configured', async () => {
    await expect(canAuthorTranslation(request)).resolves.toBe(false);
  });

  it('denies when the resolver throws', async () => {
    configureTranslationAuthorization(async () => {
      throw new Error('store down');
    });
    await expect(canAuthorTranslation(request)).resolves.toBe(false);
  });

  it('only a literal true grants', async () => {
    configureTranslationAuthorization(async () => 'yes' as any);
    await expect(canAuthorTranslation(request)).resolves.toBe(false);
    configureTranslationAuthorization(async () => true);
    await expect(canAuthorTranslation(request)).resolves.toBe(true);
  });
});
