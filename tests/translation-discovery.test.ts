import { describe, expect, it } from 'vitest';
import {
  discoverTranslationInventory,
  manifestTranslationDiscoverySource,
  parseTranslationDiscoveryManifest,
  type TranslationDeclaration,
  type TranslationDiscoverySource,
} from '@_linked/translation/discovery';
import {
  extractTranslationKeys,
  staticTranslationDiscoverySource,
} from '@_linked/translation/key-sync';
import {
  defineShapeTranslationCatalog,
  shapeCatalogTranslationDiscoverySource,
} from '@_linked/translation/shape-catalog';

const APP_ID = 'https://example.test/apps/ordinary';

function source(
  name: string,
  declarations: TranslationDeclaration[],
): TranslationDiscoverySource {
  return {
    name,
    async *discover() {
      yield* declarations;
    },
  };
}

function declaration(
  key: string,
  sourceText: string,
  options: Partial<TranslationDeclaration> & {
    sourceId?: string;
    authoritative?: boolean;
  } = {},
): TranslationDeclaration {
  const {
    sourceId = key,
    authoritative = true,
    provenance,
    ...rest
  } = options;
  return {
    schemaVersion: 1,
    key,
    sourceText,
    kind: 'ui',
    format: 'simple',
    ...rest,
    provenance: provenance ?? {
      source: 'code',
      sourceId,
      authoritative,
    },
  };
}

describe('portable translation discovery inventory', () => {
  it('turns ordinary static calls into confirmed UI declarations with provenance', async () => {
    const extracted = extractTranslationKeys(
      `
        const title = t('account.title', 'Account');
        const home = <T keyName="nav.home" defaultValue="Home" />;
      `,
      'src/app.tsx',
    );

    const snapshot = await discoverTranslationInventory(
      [staticTranslationDiscoverySource(extracted)],
      { appId: APP_ID },
    );

    expect(snapshot.items.map(({ key, status, kind }) => ({
      key,
      status,
      kind,
    }))).toEqual([
      { key: 'account.title', status: 'confirmed', kind: 'ui' },
      { key: 'nav.home', status: 'confirmed', kind: 'ui' },
    ]);
    expect(snapshot.items[0].origins[0]).toEqual({
      source: 'code',
      sourceId: 'src/app.tsx',
      authoritative: true,
      file: 'src/app.tsx',
      line: 2,
    });
    expect(snapshot.buildDeclarations).toHaveLength(2);
  });

  it('uses a versioned manifest for finite dynamic semantic keys', async () => {
    const manifest = {
      schemaVersion: 1,
      sourceId: 'workflow-statuses',
      declarations: ['draft', 'review', 'published'].map((status) => ({
        key: `status.${status}`,
        sourceText: status[0].toUpperCase() + status.slice(1),
        namespace: 'status',
        kind: 'semantic',
        ownerIri: `https://example.test/status/${status}`,
      })),
    };

    expect(parseTranslationDiscoveryManifest(manifest).schemaVersion).toBe(1);
    const snapshot = await discoverTranslationInventory(
      [manifestTranslationDiscoverySource(manifest)],
      { appId: APP_ID },
    );

    expect(snapshot.items).toHaveLength(3);
    expect(snapshot.items.every(({ status }) => status === 'confirmed')).toBe(
      true,
    );
    expect(
      snapshot.buildDeclarations.map(({ key, kind }) => ({ key, kind })),
    ).toEqual([
      { key: 'status.draft', kind: 'semantic' },
      { key: 'status.published', kind: 'semantic' },
      { key: 'status.review', kind: 'semantic' },
    ]);
  });

  it('merges matching origins and blocks conflicting authoritative source text', async () => {
    const catalog = defineShapeTranslationCatalog({
      schemaVersion: 1,
      packageName: '@linked.cm/account',
      shapeIri: 'https://linked.cm/pkg/account/shape/Account',
      entries: [{ key: 'account.title', sourceText: 'Account' }],
    });
    const matching = await discoverTranslationInventory(
      [
        staticTranslationDiscoverySource([
          {
            key: 'account.title',
            sourceText: 'Account',
            file: 'src/account.tsx',
            line: 4,
          },
        ]),
        shapeCatalogTranslationDiscoverySource(catalog),
      ],
      { appId: APP_ID },
    );

    expect(matching.items).toHaveLength(1);
    expect(matching.items[0].origins.map(({ source }) => source)).toEqual([
      'code',
      'package',
    ]);
    expect(matching.conflicts).toEqual([]);

    const conflicting = await discoverTranslationInventory(
      [
        source('a', [
          declaration('account.title', 'Account', {
            sourceId: 'src/account.tsx',
          }),
        ]),
        source('b', [
          declaration('account.title', 'Profile', {
            provenance: {
              source: 'package',
              sourceId: '@linked.cm/account',
              authoritative: true,
            },
          }),
        ]),
      ],
      { appId: APP_ID },
    );

    expect(conflicting.items[0].status).toBe('conflict');
    expect(conflicting.items[0].buildEligible).toBe(false);
    expect(
      conflicting.conflicts[0].declarations.map(({ sourceText }) => sourceText),
    ).toEqual(['Account', 'Profile']);
    expect(conflicting.buildDeclarations).toEqual([]);
  });

  it('quarantines runtime-only observations outside the build contract', async () => {
    const snapshot = await discoverTranslationInventory(
      [
        source('runtime', [
          declaration('remote.dynamic', 'Observed', {
            provenance: {
              source: 'runtime',
              sourceId: 'preview-session',
              authoritative: false,
            },
          }),
        ]),
      ],
      { appId: APP_ID },
    );

    expect(snapshot.items[0]).toMatchObject({
      status: 'pending',
      authoritative: false,
      exchangeEligible: false,
      buildEligible: false,
    });
    expect(snapshot.buildDeclarations).toEqual([]);
  });

  it('reports disappeared declarations as orphaned without deleting them', async () => {
    const previous = await discoverTranslationInventory(
      [source('code', [declaration('old.title', 'Old title')])],
      { appId: APP_ID, branchId: 'main' },
    );
    const current = await discoverTranslationInventory(
      [],
      { appId: APP_ID, branchId: 'main' },
      { previous },
    );

    expect(current.items).toEqual([
      expect.objectContaining({
        key: 'old.title',
        sourceText: 'Old title',
        status: 'orphaned',
        buildEligible: false,
      }),
    ]);
    expect(current.buildDeclarations).toEqual([]);
  });

  it('uses node and field identity for content regardless of display key', async () => {
    const content = (key: string, sourceId: string) =>
      declaration(key, 'Welcome', {
        kind: 'content',
        provenance: {
          source: 'linked',
          sourceId,
          authoritative: true,
          nodeIri: 'https://example.test/content/home',
          propertyIri: 'https://schema.org/headline',
        },
      });
    const snapshot = await discoverTranslationInventory(
      [
        source('content-a', [content('home.headline', 'graph')]),
        source('content-b', [content('page.title', 'catalog')]),
      ],
      { appId: APP_ID },
    );

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({
      kind: 'content',
      status: 'confirmed',
      buildEligible: false,
      exchangeEligible: false,
    });
    expect(snapshot.items[0].origins).toHaveLength(2);
    expect(snapshot.buildDeclarations).toEqual([]);
  });
});
