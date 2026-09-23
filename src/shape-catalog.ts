import type {
  TranslationEntryRecord,
  TranslationState,
} from './records.js';
import type { TranslationDiscoverySource } from './discovery.js';

/**
 * Code-canonical translations shipped beside one reusable LINKED shape.
 * Packages may expose this object from code or serialize the same contract as
 * JSON for Host Agent discovery without executing package code.
 */
export interface ShapeTranslationCatalog {
  schemaVersion: 1;
  packageName: string;
  /** Canonical SHACL node-shape IRI, not a display label or filesystem path. */
  shapeIri: string;
  /** Optional stable domain-class IRI used for semantic browsing. */
  targetClass?: string;
  entries: ShapeTranslationCatalogEntry[];
}

export interface ShapeTranslationCatalogEntry {
  key: string;
  sourceText: string;
  description?: string;
  namespace?: string;
  /** Stable predicate IRI when this message describes a shape property. */
  propertyIri?: string;
  format?: 'simple' | 'icu';
  /** Curated BCP-47 language values supplied by the package. */
  translations?: Record<
    string,
    string | { text: string; state?: TranslationState }
  >;
}

export interface ShapeTranslationCatalogTarget {
  listEntries(data: { appId: string }): Promise<TranslationEntryRecord[]>;
  upsertKey(data: {
    appId: string;
    key: string;
    sourceText: string;
    namespace?: string;
    description?: string;
    kind: 'ui';
    format?: 'simple' | 'icu';
    ofShape: string;
    ofProperty?: string;
    fromPackage: string;
  }): Promise<unknown>;
  upsertUnit(data: {
    appId: string;
    key: string;
    language: string;
    text: string;
    state: TranslationState;
  }): Promise<unknown>;
}

export interface ShapeTranslationInstallReport {
  createdKeys: string[];
  createdUnits: Array<{ key: string; language: string }>;
  skippedExistingKeys: string[];
  skippedExistingUnits: Array<{ key: string; language: string }>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

/** Validate and freeze the package-owned declaration at module load time. */
export function defineShapeTranslationCatalog(
  catalog: ShapeTranslationCatalog,
): Readonly<ShapeTranslationCatalog> {
  if (catalog?.schemaVersion !== 1) {
    throw new Error('Shape translation catalog schemaVersion must be 1.');
  }
  requireString(catalog.packageName, 'packageName');
  requireString(catalog.shapeIri, 'shapeIri');
  if (!Array.isArray(catalog.entries)) {
    throw new Error('Shape translation catalog entries must be an array.');
  }
  const keys = new Set<string>();
  for (const entry of catalog.entries) {
    const key = requireString(entry?.key, 'entry.key');
    requireString(entry?.sourceText, `sourceText for ${key}`);
    if (keys.has(key)) throw new Error(`Duplicate shape translation key "${key}".`);
    keys.add(key);
  }
  return Object.freeze(catalog);
}

/** Adapt the existing schema-v1 catalog without changing its install contract. */
export function shapeCatalogTranslationDiscoverySource(
  input: ShapeTranslationCatalog,
): TranslationDiscoverySource {
  const catalog = defineShapeTranslationCatalog(input);
  return {
    name: `shape-catalog:${catalog.packageName}:${catalog.shapeIri}`,
    async *discover() {
      for (const entry of catalog.entries) {
        yield {
          schemaVersion: 1,
          key: entry.key,
          sourceText: entry.sourceText,
          kind: 'ui',
          format: entry.format ?? 'simple',
          ...(entry.namespace ? { namespace: entry.namespace } : {}),
          ...(entry.description ? { description: entry.description } : {}),
          provenance: {
            source: 'package',
            sourceId: `${catalog.packageName}:${catalog.shapeIri}`,
            authoritative: true,
            ownerIri: catalog.shapeIri,
            shapeIri: catalog.shapeIri,
            fromPackage: catalog.packageName,
            ...(catalog.targetClass
              ? { targetClass: catalog.targetClass }
              : {}),
            ...(entry.propertyIri
              ? { propertyIri: entry.propertyIri }
              : {}),
          },
        };
      }
    },
  };
}

/**
 * Seed only missing app values for the currently activated languages.
 * Existing project-authored keys and units always win over package defaults.
 */
export async function installShapeTranslationCatalog(
  target: ShapeTranslationCatalogTarget,
  input: {
    appId: string;
    catalog: ShapeTranslationCatalog;
    activeLanguages: Iterable<string>;
  },
): Promise<ShapeTranslationInstallReport> {
  const appId = requireString(input.appId, 'appId');
  const catalog = defineShapeTranslationCatalog(input.catalog);
  const activeLanguages = new Set(
    [...input.activeLanguages].map((language) => language.trim()).filter(Boolean),
  );
  const existing = new Map(
    (await target.listEntries({ appId })).map((entry) => [entry.key, entry]),
  );
  const report: ShapeTranslationInstallReport = {
    createdKeys: [],
    createdUnits: [],
    skippedExistingKeys: [],
    skippedExistingUnits: [],
  };

  for (const entry of catalog.entries) {
    const current = existing.get(entry.key);
    if (current) report.skippedExistingKeys.push(entry.key);
    else {
      await target.upsertKey({
        appId,
        key: entry.key,
        sourceText: entry.sourceText,
        namespace: entry.namespace,
        description: entry.description,
        kind: 'ui',
        format: entry.format,
        ofShape: catalog.shapeIri,
        ofProperty: entry.propertyIri,
        fromPackage: catalog.packageName,
      });
      report.createdKeys.push(entry.key);
    }

    for (const language of [...activeLanguages].sort()) {
      const value = entry.translations?.[language];
      if (value === undefined) continue;
      if (current?.units[language]) {
        report.skippedExistingUnits.push({ key: entry.key, language });
        continue;
      }
      const unit = typeof value === 'string' ? { text: value } : value;
      await target.upsertUnit({
        appId,
        key: entry.key,
        language,
        text: unit.text,
        state: unit.state ?? 'reviewed',
      });
      report.createdUnits.push({ key: entry.key, language });
    }
  }
  return report;
}
