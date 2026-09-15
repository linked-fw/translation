import { describe, expect, it } from 'vitest';
import {
  linkedPackageTranslationDiscoverySource,
  parseLinkedPackageTranslationCatalog,
} from '@_linked/translation/linked-discovery';
import { discoverTranslationInventory } from '@_linked/translation/discovery';

const packageCatalog = {
  schemaVersion: 1,
  packageName: '@linked.cm/commerce',
  entrypoint: 'throw new Error("must never execute")',
  shapes: [
    {
      schemaVersion: 1,
      packageName: '@linked.cm/commerce',
      shapeIri: 'https://linked.cm/pkg/commerce/shape/Product',
      targetClass: 'https://schema.org/Product',
      entries: [
        {
          key: 'product.name',
          sourceText: 'Product name',
          propertyIri: 'https://schema.org/name',
          translations: { es: 'Nombre del producto' },
        },
      ],
    },
  ],
  components: [
    {
      componentIri: 'https://linked.cm/pkg/commerce/component/ProductCard',
      entries: [
        {
          key: 'product.card.help',
          sourceText: 'Choose a product',
          type: 'help',
        },
      ],
    },
  ],
  controlledValues: ['draft', 'active', 'retired'].map((value) => ({
    key: `product.status.${value}`,
    sourceText: value[0].toUpperCase() + value.slice(1),
    ownerIri: `https://linked.cm/pkg/commerce/status/${value}`,
  })),
  workflowRoles: [
    {
      key: 'role.merchant',
      sourceText: 'Merchant',
      ownerIri: 'https://linked.cm/pkg/commerce/role/Merchant',
    },
  ],
  skosConcepts: [
    {
      key: 'category.community',
      sourceText: 'Community',
      ownerIri: 'https://linked.cm/pkg/commerce/concept/Community',
    },
  ],
  content: [
    {
      key: 'product.42.headline',
      sourceText: 'A shared marketplace',
      nodeIri: 'https://example.test/products/42',
      propertyIri: 'https://schema.org/headline',
    },
  ],
};

describe('LINKED package translation discovery', () => {
  it('discovers serialized shape catalogs with complete package provenance', async () => {
    const source = linkedPackageTranslationDiscoverySource(
      JSON.stringify(packageCatalog),
    );
    const declarations = [];
    for await (const declaration of source.discover({
      appId: 'https://example.test/app',
    })) {
      declarations.push(declaration);
    }

    expect(
      declarations.find(({ key }) => key === 'product.name'),
    ).toEqual(
      expect.objectContaining({
        sourceText: 'Product name',
        kind: 'ui',
        provenance: expect.objectContaining({
          source: 'package',
          ownerIri: 'https://linked.cm/pkg/commerce/shape/Product',
          shapeIri: 'https://linked.cm/pkg/commerce/shape/Product',
          propertyIri: 'https://schema.org/name',
          fromPackage: '@linked.cm/commerce',
          targetClass: 'https://schema.org/Product',
        }),
      }),
    );
    expect(
      declarations.find(({ key }) => key === 'product.card.help'),
    ).toEqual(
      expect.objectContaining({
        kind: 'semantic',
        provenance: expect.objectContaining({
          ownerIri:
            'https://linked.cm/pkg/commerce/component/ProductCard',
          fromPackage: '@linked.cm/commerce',
        }),
      }),
    );
  });

  it('turns controlled values into stable IRI-owned semantic declarations', async () => {
    const snapshot = await discoverTranslationInventory(
      [
        linkedPackageTranslationDiscoverySource(
          new TextEncoder().encode(JSON.stringify(packageCatalog)),
        ),
      ],
      { appId: 'https://example.test/app' },
    );
    const controlled = snapshot.items.filter(({ key }) =>
      key.startsWith('product.status.'),
    );

    expect(controlled).toHaveLength(3);
    expect(controlled.every(({ kind, status }) =>
      kind === 'semantic' && status === 'confirmed'
    )).toBe(true);
    expect(
      controlled.map(({ origins }) => origins[0].ownerIri),
    ).toEqual([
      'https://linked.cm/pkg/commerce/status/active',
      'https://linked.cm/pkg/commerce/status/draft',
      'https://linked.cm/pkg/commerce/status/retired',
    ]);
  });

  it('retains SKOS concept owner IRIs', async () => {
    const snapshot = await discoverTranslationInventory(
      [linkedPackageTranslationDiscoverySource(JSON.stringify(packageCatalog))],
      { appId: 'https://example.test/app' },
    );
    const concept = snapshot.items.find(
      ({ key }) => key === 'category.community',
    );

    expect(concept).toMatchObject({
      kind: 'semantic',
      status: 'confirmed',
      origins: [
        expect.objectContaining({
          ownerIri:
            'https://linked.cm/pkg/commerce/concept/Community',
          fromPackage: '@linked.cm/commerce',
        }),
      ],
    });
  });

  it('discovers content identity but excludes it from UI exchange/build output', async () => {
    const snapshot = await discoverTranslationInventory(
      [linkedPackageTranslationDiscoverySource(JSON.stringify(packageCatalog))],
      { appId: 'https://example.test/app' },
    );
    const content = snapshot.items.find(
      ({ key }) => key === 'product.42.headline',
    );

    expect(content).toMatchObject({
      kind: 'content',
      status: 'confirmed',
      exchangeEligible: false,
      buildEligible: false,
      origins: [
        expect.objectContaining({
          nodeIri: 'https://example.test/products/42',
          propertyIri: 'https://schema.org/headline',
        }),
      ],
    });
    expect(
      snapshot.buildDeclarations.some(
        ({ key }) => key === 'product.42.headline',
      ),
    ).toBe(false);
  });

  it('rejects schema mismatches and duplicates before exposing a source', () => {
    expect(() =>
      parseLinkedPackageTranslationCatalog(
        JSON.stringify({ ...packageCatalog, schemaVersion: 2 }),
      ),
    ).toThrow('schemaVersion must be 1');
    expect(() =>
      linkedPackageTranslationDiscoverySource(
        JSON.stringify({
          ...packageCatalog,
          labels: [
            {
              key: 'product.name',
              sourceText: 'Duplicate',
              ownerIri: 'https://example.test/duplicate',
            },
          ],
        }),
      ),
    ).toThrow('Duplicate linked translation key');
  });
});
