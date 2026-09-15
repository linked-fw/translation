import { describe, expect, it, vi } from 'vitest';
import {
  defineShapeTranslationCatalog,
  installShapeTranslationCatalog,
  shapeCatalogTranslationDiscoverySource,
  type ShapeTranslationCatalogTarget,
} from '@_linked/translation/shape-catalog';

const catalog = defineShapeTranslationCatalog({
  schemaVersion: 1,
  packageName: '@linked.cm/commerce',
  shapeIri: 'https://linked.cm/pkg/commerce/shape/Product',
  targetClass: 'https://schema.org/Product',
  entries: [
    {
      key: 'commerce.product.name',
      sourceText: 'Product name',
      propertyIri: 'https://schema.org/name',
      translations: { es: 'Nombre del producto', fr: 'Nom du produit' },
    },
  ],
});

describe('shape translation catalogs', () => {
  it('adapts schema-v1 catalogs to portable declarations', async () => {
    const declarations = [];
    for await (const declaration of shapeCatalogTranslationDiscoverySource(
      catalog,
    ).discover({ appId: 'https://example.test/app' })) {
      declarations.push(declaration);
    }

    expect(declarations).toEqual([
      expect.objectContaining({
        key: 'commerce.product.name',
        sourceText: 'Product name',
        kind: 'ui',
        format: 'simple',
        provenance: expect.objectContaining({
          source: 'package',
          sourceId:
            '@linked.cm/commerce:https://linked.cm/pkg/commerce/shape/Product',
          authoritative: true,
          shapeIri: 'https://linked.cm/pkg/commerce/shape/Product',
          propertyIri: 'https://schema.org/name',
        }),
      }),
    ]);
  });

  it('seeds only activated languages and records semantic package context', async () => {
    const target: ShapeTranslationCatalogTarget = {
      listEntries: async () => [],
      upsertKey: vi.fn(async () => undefined),
      upsertUnit: vi.fn(async () => undefined),
    };

    const report = await installShapeTranslationCatalog(target, {
      appId: 'https://example.test/app',
      catalog,
      activeLanguages: ['es'],
    });

    expect(report.createdKeys).toEqual(['commerce.product.name']);
    expect(report.createdUnits).toEqual([
      { key: 'commerce.product.name', language: 'es' },
    ]);
    expect(target.upsertKey).toHaveBeenCalledWith(
      expect.objectContaining({
        ofShape: catalog.shapeIri,
        ofProperty: 'https://schema.org/name',
        fromPackage: '@linked.cm/commerce',
      }),
    );
    expect(target.upsertUnit).not.toHaveBeenCalledWith(
      expect.objectContaining({ language: 'fr' }),
    );
  });

  it('never overwrites existing app-authored keys or language units', async () => {
    const target: ShapeTranslationCatalogTarget = {
      listEntries: async () => [
        {
          key: 'commerce.product.name',
          namespace: 'commerce.product',
          sourceText: 'Custom product label',
          kind: 'ui',
          format: 'simple',
          units: {
            es: { language: 'es', text: 'Nombre personalizado', state: 'reviewed' },
          },
        },
      ],
      upsertKey: vi.fn(async () => undefined),
      upsertUnit: vi.fn(async () => undefined),
    };

    const report = await installShapeTranslationCatalog(target, {
      appId: 'https://example.test/app',
      catalog,
      activeLanguages: ['es', 'fr'],
    });

    expect(target.upsertKey).not.toHaveBeenCalled();
    expect(target.upsertUnit).toHaveBeenCalledTimes(1);
    expect(target.upsertUnit).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'fr', text: 'Nom du produit' }),
    );
    expect(report.skippedExistingKeys).toEqual(['commerce.product.name']);
    expect(report.skippedExistingUnits).toEqual([
      { key: 'commerce.product.name', language: 'es' },
    ]);
  });
});
