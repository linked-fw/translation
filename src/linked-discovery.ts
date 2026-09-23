import type { MessageFormat } from './core/messages.js';
import type {
  TranslationDeclaration,
  TranslationDiscoverySource,
} from './discovery.js';
import {
  defineShapeTranslationCatalog,
  shapeCatalogTranslationDiscoverySource,
  type ShapeTranslationCatalog,
  type ShapeTranslationCatalogEntry,
} from './shape-catalog.js';

export type LinkedSemanticEntryType =
  | 'label'
  | 'help'
  | 'validation'
  | 'controlled-value'
  | 'workflow-role'
  | 'skos-concept';

export interface LinkedSemanticCatalogEntry {
  key: string;
  sourceText: string;
  ownerIri: string;
  namespace?: string;
  description?: string;
  format?: MessageFormat;
  shapeIri?: string;
  propertyIri?: string;
  targetClass?: string;
  type?: LinkedSemanticEntryType;
}

export interface LinkedComponentTranslationCatalog {
  componentIri: string;
  targetClass?: string;
  entries: Array<Omit<LinkedSemanticCatalogEntry, 'ownerIri'>>;
}

export interface LinkedContentTranslationCatalogEntry {
  key: string;
  sourceText: string;
  nodeIri: string;
  propertyIri: string;
  description?: string;
  format?: MessageFormat;
}

export interface LinkedPackageTranslationCatalog {
  schemaVersion: 1;
  packageName: string;
  shapes: ShapeTranslationCatalog[];
  components: LinkedComponentTranslationCatalog[];
  labels: LinkedSemanticCatalogEntry[];
  controlledValues: LinkedSemanticCatalogEntry[];
  workflowRoles: LinkedSemanticCatalogEntry[];
  skosConcepts: LinkedSemanticCatalogEntry[];
  content: LinkedContentTranslationCatalogEntry[];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string when supplied.`);
  }
  return value.trim();
}

function format(value: unknown, label: string): MessageFormat | undefined {
  if (value === undefined) return undefined;
  if (value !== 'simple' && value !== 'icu') {
    throw new Error(`${label} must be "simple" or "icu".`);
  }
  return value;
}

function array(value: unknown, label: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function semanticEntry(
  value: unknown,
  label: string,
  expectedType?: LinkedSemanticEntryType,
): LinkedSemanticCatalogEntry {
  const entry = record(value, label);
  const type = (entry.type ?? expectedType) as LinkedSemanticEntryType | undefined;
  if (
    type !== undefined &&
    type !== 'label' &&
    type !== 'help' &&
    type !== 'validation' &&
    type !== 'controlled-value' &&
    type !== 'workflow-role' &&
    type !== 'skos-concept'
  ) {
    throw new Error(`${label}.type is invalid.`);
  }
  if (typeof entry.sourceText !== 'string') {
    throw new Error(`${label}.sourceText must be a string.`);
  }
  return {
    key: requiredString(entry.key, `${label}.key`),
    sourceText: entry.sourceText,
    ownerIri: requiredString(entry.ownerIri, `${label}.ownerIri`),
    ...(optionalString(entry.namespace, `${label}.namespace`)
      ? { namespace: entry.namespace as string }
      : {}),
    ...(optionalString(entry.description, `${label}.description`)
      ? { description: entry.description as string }
      : {}),
    ...(format(entry.format, `${label}.format`)
      ? { format: entry.format as MessageFormat }
      : {}),
    ...(optionalString(entry.shapeIri, `${label}.shapeIri`)
      ? { shapeIri: entry.shapeIri as string }
      : {}),
    ...(optionalString(entry.propertyIri, `${label}.propertyIri`)
      ? { propertyIri: entry.propertyIri as string }
      : {}),
    ...(optionalString(entry.targetClass, `${label}.targetClass`)
      ? { targetClass: entry.targetClass as string }
      : {}),
    ...(type ? { type } : {}),
  };
}

function component(
  value: unknown,
  index: number,
): LinkedComponentTranslationCatalog {
  const item = record(value, `components[${index}]`);
  const componentIri = requiredString(
    item.componentIri,
    `components[${index}].componentIri`,
  );
  const entries = array(item.entries, `components[${index}].entries`).map(
    (raw, entryIndex) => {
      const parsed = semanticEntry(
        {
          ...record(raw, `components[${index}].entries[${entryIndex}]`),
          ownerIri: componentIri,
        },
        `components[${index}].entries[${entryIndex}]`,
      );
      const { ownerIri: _ownerIri, ...entry } = parsed;
      return entry;
    },
  );
  return {
    componentIri,
    entries,
    ...(optionalString(item.targetClass, `components[${index}].targetClass`)
      ? { targetClass: item.targetClass as string }
      : {}),
  };
}

function contentEntry(
  value: unknown,
  index: number,
): LinkedContentTranslationCatalogEntry {
  const entry = record(value, `content[${index}]`);
  if (typeof entry.sourceText !== 'string') {
    throw new Error(`content[${index}].sourceText must be a string.`);
  }
  return {
    key: requiredString(entry.key, `content[${index}].key`),
    sourceText: entry.sourceText,
    nodeIri: requiredString(entry.nodeIri, `content[${index}].nodeIri`),
    propertyIri: requiredString(
      entry.propertyIri,
      `content[${index}].propertyIri`,
    ),
    ...(optionalString(entry.description, `content[${index}].description`)
      ? { description: entry.description as string }
      : {}),
    ...(format(entry.format, `content[${index}].format`)
      ? { format: entry.format as MessageFormat }
      : {}),
  };
}

function shapeCatalog(value: unknown, index: number): ShapeTranslationCatalog {
  const shape = record(value, `shapes[${index}]`);
  return defineShapeTranslationCatalog({
    schemaVersion: shape.schemaVersion as 1,
    packageName: requiredString(
      shape.packageName,
      `shapes[${index}].packageName`,
    ),
    shapeIri: requiredString(shape.shapeIri, `shapes[${index}].shapeIri`),
    ...(optionalString(shape.targetClass, `shapes[${index}].targetClass`)
      ? { targetClass: shape.targetClass as string }
      : {}),
    entries: array(shape.entries, `shapes[${index}].entries`) as ShapeTranslationCatalogEntry[],
  });
}

function assertNoDuplicateIdentities(
  catalog: LinkedPackageTranslationCatalog,
): void {
  const messages = new Set<string>();
  const add = (key: string, namespace = '') => {
    const identity = JSON.stringify([namespace, key]);
    if (messages.has(identity)) {
      throw new Error(`Duplicate linked translation key "${key}".`);
    }
    messages.add(identity);
  };
  for (const shape of catalog.shapes) {
    for (const entry of shape.entries) add(entry.key, entry.namespace);
  }
  for (const component of catalog.components) {
    for (const entry of component.entries) add(entry.key, entry.namespace);
  }
  for (const entries of [
    catalog.labels,
    catalog.controlledValues,
    catalog.workflowRoles,
    catalog.skosConcepts,
  ]) {
    for (const entry of entries) add(entry.key, entry.namespace);
  }
  const content = new Set<string>();
  for (const entry of catalog.content) {
    const identity = JSON.stringify([entry.nodeIri, entry.propertyIri]);
    if (content.has(identity)) {
      throw new Error(
        `Duplicate linked content translation field "${entry.nodeIri}" / "${entry.propertyIri}".`,
      );
    }
    content.add(identity);
  }
}

/** Parse serialized JSON only; package JavaScript is never imported or run. */
export function parseLinkedPackageTranslationCatalog(
  input: string | Uint8Array,
): LinkedPackageTranslationCatalog {
  let value: unknown;
  try {
    value = JSON.parse(
      typeof input === 'string' ? input : new TextDecoder().decode(input),
    );
  } catch {
    throw new Error('Linked translation catalog must be valid JSON.');
  }
  const raw = record(value, 'catalog');
  if (raw.schemaVersion !== 1) {
    throw new Error('Linked translation catalog schemaVersion must be 1.');
  }
  const catalog: LinkedPackageTranslationCatalog = {
    schemaVersion: 1,
    packageName: requiredString(raw.packageName, 'catalog.packageName'),
    shapes: array(raw.shapes, 'catalog.shapes').map(shapeCatalog),
    components: array(raw.components, 'catalog.components').map(component),
    labels: array(raw.labels, 'catalog.labels').map((entry, index) =>
      semanticEntry(entry, `labels[${index}]`, 'label'),
    ),
    controlledValues: array(
      raw.controlledValues,
      'catalog.controlledValues',
    ).map((entry, index) =>
      semanticEntry(
        entry,
        `controlledValues[${index}]`,
        'controlled-value',
      ),
    ),
    workflowRoles: array(raw.workflowRoles, 'catalog.workflowRoles').map(
      (entry, index) =>
        semanticEntry(entry, `workflowRoles[${index}]`, 'workflow-role'),
    ),
    skosConcepts: array(raw.skosConcepts, 'catalog.skosConcepts').map(
      (entry, index) =>
        semanticEntry(entry, `skosConcepts[${index}]`, 'skos-concept'),
    ),
    content: array(raw.content, 'catalog.content').map(contentEntry),
  };
  for (const shape of catalog.shapes) {
    if (shape.packageName !== catalog.packageName) {
      throw new Error(
        `Shape catalog package "${shape.packageName}" does not match "${catalog.packageName}".`,
      );
    }
  }
  assertNoDuplicateIdentities(catalog);
  return catalog;
}

function semanticDeclaration(
  packageName: string,
  category: string,
  entry: LinkedSemanticCatalogEntry,
): TranslationDeclaration {
  return {
    schemaVersion: 1,
    key: entry.key,
    sourceText: entry.sourceText,
    kind: 'semantic',
    format: entry.format ?? 'simple',
    ...(entry.namespace ? { namespace: entry.namespace } : {}),
    ...(entry.description ? { description: entry.description } : {}),
    provenance: {
      source: 'linked',
      sourceId: `${packageName}:${category}:${entry.ownerIri}`,
      authoritative: true,
      ownerIri: entry.ownerIri,
      fromPackage: packageName,
      ...(entry.shapeIri ? { shapeIri: entry.shapeIri } : {}),
      ...(entry.propertyIri ? { propertyIri: entry.propertyIri } : {}),
      ...(entry.targetClass ? { targetClass: entry.targetClass } : {}),
    },
  };
}

/** Discover safe serialized LINKED package metadata without code execution. */
export function linkedPackageTranslationDiscoverySource(
  input: string | Uint8Array,
): TranslationDiscoverySource {
  const catalog = parseLinkedPackageTranslationCatalog(input);
  return {
    name: `linked-package:${catalog.packageName}`,
    async *discover(context) {
      for (const shape of catalog.shapes) {
        yield* shapeCatalogTranslationDiscoverySource(shape).discover(context);
      }
      for (const component of catalog.components) {
        for (const entry of component.entries) {
          yield semanticDeclaration(catalog.packageName, 'component', {
            ...entry,
            ownerIri: component.componentIri,
            targetClass: entry.targetClass ?? component.targetClass,
          });
        }
      }
      for (const [category, entries] of [
        ['label', catalog.labels],
        ['controlled-value', catalog.controlledValues],
        ['workflow-role', catalog.workflowRoles],
        ['skos-concept', catalog.skosConcepts],
      ] as const) {
        for (const entry of entries) {
          yield semanticDeclaration(catalog.packageName, category, entry);
        }
      }
      for (const entry of catalog.content) {
        yield {
          schemaVersion: 1,
          key: entry.key,
          sourceText: entry.sourceText,
          kind: 'content',
          format: entry.format ?? 'simple',
          ...(entry.description ? { description: entry.description } : {}),
          provenance: {
            source: 'linked',
            sourceId: `${catalog.packageName}:content:${entry.nodeIri}:${entry.propertyIri}`,
            authoritative: true,
            ownerIri: entry.nodeIri,
            nodeIri: entry.nodeIri,
            propertyIri: entry.propertyIri,
            fromPackage: catalog.packageName,
          },
        };
      }
    },
  };
}
