import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverTranslationInventory } from '@_linked/translation/discovery';
import {
  LINKED_TRANSLATION_CATALOG_FIELD,
  TRANSLATION_DISCOVERY_MANIFEST_FILE,
  loadWorkspaceTranslationDiscoverySources,
  sourceTreeTranslationDiscoverySource,
} from '@_linked/translation/key-sync/node';

const APP_ID = 'https://example.test/apps/portable';
const roots: string[] = [];

async function workspace(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `translation-${name}-`));
  roots.push(root);
  await mkdir(join(root, 'src'), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe('workspace translation discovery', () => {
  it('combines ordinary source calls, a dynamic manifest, and a serialized LINKED dependency catalog', async () => {
    const root = await workspace('host');
    const linkedPackage = join(
      root,
      'node_modules',
      '@linked.cm',
      'account',
    );
    await mkdir(linkedPackage, { recursive: true });
    await writeFile(
      join(root, 'src', 'app.tsx'),
      `const title = t('nav.home', 'Home');`,
      'utf8',
    );
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'ordinary-app',
        dependencies: { '@linked.cm/account': '1.0.0' },
      }),
      'utf8',
    );
    await writeFile(
      join(root, TRANSLATION_DISCOVERY_MANIFEST_FILE),
      JSON.stringify({
        schemaVersion: 1,
        sourceId: 'ordinary-app:workflow-statuses',
        declarations: [
          {
            key: 'workflow.status.draft',
            sourceText: 'Draft',
            kind: 'semantic',
          },
        ],
      }),
      'utf8',
    );
    await writeFile(
      join(linkedPackage, 'package.json'),
      JSON.stringify({
        name: '@linked.cm/account',
        [LINKED_TRANSLATION_CATALOG_FIELD]: './translation.catalog.json',
      }),
      'utf8',
    );
    await writeFile(
      join(linkedPackage, 'index.js'),
      `throw new Error('package code must never execute');`,
      'utf8',
    );
    await writeFile(
      join(linkedPackage, 'translation.catalog.json'),
      JSON.stringify({
        schemaVersion: 1,
        packageName: '@linked.cm/account',
        shapes: [
          {
            schemaVersion: 1,
            packageName: '@linked.cm/account',
            shapeIri: 'https://linked.cm/pkg/account/shape/Account',
            entries: [
              {
                key: 'account.displayName',
                sourceText: 'Display name',
                propertyIri: 'https://schema.org/name',
              },
            ],
          },
        ],
        components: [],
        labels: [],
        controlledValues: [],
        workflowRoles: [],
        skosConcepts: [],
        content: [],
      }),
      'utf8',
    );

    const snapshot = await discoverTranslationInventory(
      [
        sourceTreeTranslationDiscoverySource(join(root, 'src')),
        ...(await loadWorkspaceTranslationDiscoverySources(root)),
      ],
      { appId: APP_ID, branchId: 'main', sourceRoot: root },
    );

    expect(snapshot.items.map(({ key, status }) => ({ key, status }))).toEqual([
      { key: 'account.displayName', status: 'confirmed' },
      { key: 'nav.home', status: 'confirmed' },
      { key: 'workflow.status.draft', status: 'confirmed' },
    ]);
    expect(
      snapshot.items.find(({ key }) => key === 'account.displayName')?.origins,
    ).toEqual([
      expect.objectContaining({
        source: 'package',
        fromPackage: '@linked.cm/account',
        shapeIri: 'https://linked.cm/pkg/account/shape/Account',
      }),
    ]);
  });

  it('keeps branch manifest provenance isolated', async () => {
    const main = await workspace('main');
    const change = await workspace('change');
    for (const [root, branch, key] of [
      [main, 'main', 'main.only'],
      [change, 'change-1', 'change.only'],
    ] as const) {
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ name: `app-${branch}` }),
        'utf8',
      );
      await writeFile(
        join(root, TRANSLATION_DISCOVERY_MANIFEST_FILE),
        JSON.stringify({
          schemaVersion: 1,
          sourceId: `manifest:${branch}`,
          declarations: [{ key, sourceText: key }],
        }),
        'utf8',
      );
    }

    const mainSnapshot = await discoverTranslationInventory(
      await loadWorkspaceTranslationDiscoverySources(main),
      { appId: APP_ID, branchId: 'main', sourceRoot: main },
    );
    const changeSnapshot = await discoverTranslationInventory(
      await loadWorkspaceTranslationDiscoverySources(change),
      { appId: APP_ID, branchId: 'change-1', sourceRoot: change },
    );

    expect(mainSnapshot.items.map(({ key }) => key)).toEqual(['main.only']);
    expect(changeSnapshot.items.map(({ key }) => key)).toEqual([
      'change.only',
    ]);
    expect(mainSnapshot.items[0].origins[0].sourceId).toBe('manifest:main');
    expect(changeSnapshot.items[0].origins[0].sourceId).toBe(
      'manifest:change-1',
    );
  });

  it('rejects package catalog paths that escape their package', async () => {
    const root = await workspace('escape');
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'unsafe-app',
        [LINKED_TRANSLATION_CATALOG_FIELD]: '../outside.json',
      }),
      'utf8',
    );

    await expect(
      loadWorkspaceTranslationDiscoverySources(root),
    ).rejects.toThrow('must stay inside its package');
  });
});
