import type { MessageFormat } from './core/messages.js';
import type {
  TranslationBuildDeclaration,
  TranslationDeclarationKind,
  TranslationDeclarationStatus,
} from './exchange.js';

export type TranslationDeclarationSource =
  | 'code'
  | 'manifest'
  | 'package'
  | 'linked'
  | 'import'
  | 'runtime';

export interface TranslationDeclarationProvenance {
  source: TranslationDeclarationSource;
  sourceId: string;
  authoritative: boolean;
  file?: string;
  line?: number;
  ownerIri?: string;
  shapeIri?: string;
  propertyIri?: string;
  nodeIri?: string;
  fromPackage?: string;
  targetClass?: string;
}

export interface TranslationDeclaration {
  schemaVersion: 1;
  key: string;
  sourceText: string;
  namespace?: string;
  kind: TranslationDeclarationKind;
  format: MessageFormat;
  description?: string;
  provenance: TranslationDeclarationProvenance;
}

export interface TranslationDiscoveryContext {
  appId: string;
  branchId?: string;
  sourceRoot?: string;
}

export interface TranslationDiscoverySource {
  readonly name: string;
  discover(
    context: TranslationDiscoveryContext,
  ): AsyncIterable<TranslationDeclaration>;
}

export type TranslationInventoryStatus =
  | 'confirmed'
  | 'pending'
  | 'conflict'
  | 'orphaned';

export interface TranslationInventoryItem {
  identity: string;
  appId: string;
  key: string;
  sourceText: string;
  namespace?: string;
  kind: TranslationDeclarationKind;
  format: MessageFormat;
  description?: string;
  status: TranslationInventoryStatus;
  authoritative: boolean;
  exchangeEligible: boolean;
  buildEligible: boolean;
  origins: TranslationDeclarationProvenance[];
}

export interface TranslationInventoryConflict {
  identity: string;
  declarations: TranslationDeclaration[];
}

export interface TranslationInventorySnapshot {
  schemaVersion: 1;
  appId: string;
  branchId?: string;
  items: TranslationInventoryItem[];
  conflicts: TranslationInventoryConflict[];
  buildDeclarations: TranslationBuildDeclaration[];
}

export interface TranslationDiscoveryManifestEntry {
  key: string;
  sourceText: string;
  namespace?: string;
  kind?: TranslationDeclarationKind;
  format?: MessageFormat;
  description?: string;
  ownerIri?: string;
  shapeIri?: string;
  propertyIri?: string;
  nodeIri?: string;
}

export interface TranslationDiscoveryManifest {
  schemaVersion: 1;
  sourceId: string;
  declarations: TranslationDiscoveryManifestEntry[];
}

export interface DiscoverTranslationInventoryOptions {
  previous?: TranslationInventorySnapshot;
}

const KIND_ORDER: Record<TranslationDeclarationKind, number> = {
  ui: 0,
  semantic: 1,
  content: 2,
};

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

function declarationKind(
  value: unknown,
  label: string,
  fallback: TranslationDeclarationKind = 'ui',
): TranslationDeclarationKind {
  const candidate = value ?? fallback;
  if (
    candidate !== 'ui' &&
    candidate !== 'semantic' &&
    candidate !== 'content'
  ) {
    throw new Error(`${label} must be "ui", "semantic", or "content".`);
  }
  return candidate;
}

function messageFormat(
  value: unknown,
  label: string,
  fallback: MessageFormat = 'simple',
): MessageFormat {
  const candidate = value ?? fallback;
  if (candidate !== 'simple' && candidate !== 'icu') {
    throw new Error(`${label} must be "simple" or "icu".`);
  }
  return candidate;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function normalizeManifestEntry(
  value: unknown,
  index: number,
): TranslationDiscoveryManifestEntry {
  const entry = object(value, `declarations[${index}]`);
  const kind = declarationKind(entry.kind, `declarations[${index}].kind`);
  const nodeIri = optionalString(
    entry.nodeIri,
    `declarations[${index}].nodeIri`,
  );
  const propertyIri = optionalString(
    entry.propertyIri,
    `declarations[${index}].propertyIri`,
  );
  if (kind === 'content' && (!nodeIri || !propertyIri)) {
    throw new Error(
      `declarations[${index}] content entries require nodeIri and propertyIri.`,
    );
  }
  if (typeof entry.sourceText !== 'string') {
    throw new Error(`declarations[${index}].sourceText must be a string.`);
  }
  return {
    key: requiredString(entry.key, `declarations[${index}].key`),
    sourceText: entry.sourceText,
    kind,
    format: messageFormat(entry.format, `declarations[${index}].format`),
    ...(optionalString(
      entry.namespace,
      `declarations[${index}].namespace`,
    )
      ? {
          namespace: optionalString(
            entry.namespace,
            `declarations[${index}].namespace`,
          ),
        }
      : {}),
    ...(optionalString(
      entry.description,
      `declarations[${index}].description`,
    )
      ? {
          description: optionalString(
            entry.description,
            `declarations[${index}].description`,
          ),
        }
      : {}),
    ...(optionalString(entry.ownerIri, `declarations[${index}].ownerIri`)
      ? {
          ownerIri: optionalString(
            entry.ownerIri,
            `declarations[${index}].ownerIri`,
          ),
        }
      : {}),
    ...(optionalString(entry.shapeIri, `declarations[${index}].shapeIri`)
      ? {
          shapeIri: optionalString(
            entry.shapeIri,
            `declarations[${index}].shapeIri`,
          ),
        }
      : {}),
    ...(propertyIri ? { propertyIri } : {}),
    ...(nodeIri ? { nodeIri } : {}),
  };
}

/** Parse the portable v1 manifest used to declare dynamic translation keys. */
export function parseTranslationDiscoveryManifest(
  value: unknown,
): TranslationDiscoveryManifest {
  const manifest = object(value, 'manifest');
  if (manifest.schemaVersion !== 1) {
    throw new Error('Translation discovery manifest schemaVersion must be 1.');
  }
  if (!Array.isArray(manifest.declarations)) {
    throw new Error('Translation discovery manifest declarations must be an array.');
  }
  return {
    schemaVersion: 1,
    sourceId: requiredString(manifest.sourceId, 'manifest.sourceId'),
    declarations: manifest.declarations.map(normalizeManifestEntry),
  };
}

/** Turn a portable manifest into an authoritative discovery source. */
export function manifestTranslationDiscoverySource(
  value: unknown,
): TranslationDiscoverySource {
  const manifest = parseTranslationDiscoveryManifest(value);
  return {
    name: `manifest:${manifest.sourceId}`,
    async *discover() {
      for (const entry of manifest.declarations) {
        yield {
          schemaVersion: 1,
          key: entry.key,
          sourceText: entry.sourceText,
          kind: entry.kind ?? 'ui',
          format: entry.format ?? 'simple',
          ...(entry.namespace ? { namespace: entry.namespace } : {}),
          ...(entry.description ? { description: entry.description } : {}),
          provenance: {
            source: 'manifest',
            sourceId: manifest.sourceId,
            authoritative: true,
            ...(entry.ownerIri ? { ownerIri: entry.ownerIri } : {}),
            ...(entry.shapeIri ? { shapeIri: entry.shapeIri } : {}),
            ...(entry.propertyIri ? { propertyIri: entry.propertyIri } : {}),
            ...(entry.nodeIri ? { nodeIri: entry.nodeIri } : {}),
          },
        };
      }
    },
  };
}

function normalizeDeclaration(
  declaration: TranslationDeclaration,
): TranslationDeclaration {
  if (declaration?.schemaVersion !== 1) {
    throw new Error('Translation declaration schemaVersion must be 1.');
  }
  const kind = declarationKind(declaration.kind, 'declaration.kind');
  const provenance = object(
    declaration.provenance,
    'declaration.provenance',
  ) as unknown as TranslationDeclarationProvenance;
  const nodeIri = optionalString(provenance.nodeIri, 'provenance.nodeIri');
  const propertyIri = optionalString(
    provenance.propertyIri,
    'provenance.propertyIri',
  );
  if (kind === 'content' && (!nodeIri || !propertyIri)) {
    throw new Error(
      'Content translation declarations require provenance.nodeIri and provenance.propertyIri.',
    );
  }
  if (typeof declaration.sourceText !== 'string') {
    throw new Error('declaration.sourceText must be a string.');
  }
  const source = provenance.source;
  if (
    source !== 'code' &&
    source !== 'manifest' &&
    source !== 'package' &&
    source !== 'linked' &&
    source !== 'import' &&
    source !== 'runtime'
  ) {
    throw new Error('declaration.provenance.source is invalid.');
  }
  if (typeof provenance.authoritative !== 'boolean') {
    throw new Error('declaration.provenance.authoritative must be boolean.');
  }
  return {
    schemaVersion: 1,
    key: requiredString(declaration.key, 'declaration.key'),
    sourceText: declaration.sourceText,
    kind,
    format: messageFormat(declaration.format, 'declaration.format'),
    ...(optionalString(declaration.namespace, 'declaration.namespace')
      ? { namespace: declaration.namespace!.trim() }
      : {}),
    ...(optionalString(declaration.description, 'declaration.description')
      ? { description: declaration.description!.trim() }
      : {}),
    provenance: {
      source,
      sourceId: requiredString(provenance.sourceId, 'provenance.sourceId'),
      authoritative: provenance.authoritative,
      ...(optionalString(provenance.file, 'provenance.file')
        ? { file: provenance.file!.trim() }
        : {}),
      ...(provenance.line === undefined
        ? {}
        : Number.isSafeInteger(provenance.line) && provenance.line > 0
          ? { line: provenance.line }
          : (() => {
              throw new Error('provenance.line must be a positive integer.');
            })()),
      ...(optionalString(provenance.ownerIri, 'provenance.ownerIri')
        ? { ownerIri: provenance.ownerIri!.trim() }
        : {}),
      ...(optionalString(provenance.shapeIri, 'provenance.shapeIri')
        ? { shapeIri: provenance.shapeIri!.trim() }
        : {}),
      ...(propertyIri ? { propertyIri } : {}),
      ...(nodeIri ? { nodeIri } : {}),
      ...(optionalString(provenance.fromPackage, 'provenance.fromPackage')
        ? { fromPackage: provenance.fromPackage!.trim() }
        : {}),
      ...(optionalString(provenance.targetClass, 'provenance.targetClass')
        ? { targetClass: provenance.targetClass!.trim() }
        : {}),
    },
  };
}

/** Stable identity: UI/semantic by namespace+key; content by node+field IRI. */
export function translationDeclarationIdentity(
  appId: string,
  declaration: TranslationDeclaration,
): string {
  const normalizedAppId = requiredString(appId, 'appId');
  if (declaration.kind === 'content') {
    return `content:${JSON.stringify([
      normalizedAppId,
      declaration.provenance.nodeIri,
      declaration.provenance.propertyIri,
    ])}`;
  }
  return `message:${JSON.stringify([
    normalizedAppId,
    declaration.namespace ?? '',
    declaration.key,
  ])}`;
}

function canonicalProvenance(
  provenance: TranslationDeclarationProvenance,
): string {
  return JSON.stringify([
    provenance.source,
    provenance.sourceId,
    provenance.authoritative,
    provenance.file ?? '',
    provenance.line ?? 0,
    provenance.ownerIri ?? '',
    provenance.shapeIri ?? '',
    provenance.propertyIri ?? '',
    provenance.nodeIri ?? '',
    provenance.fromPackage ?? '',
    provenance.targetClass ?? '',
  ]);
}

function sortDeclarations(
  declarations: TranslationDeclaration[],
): TranslationDeclaration[] {
  return [...declarations].sort((left, right) => {
    const source = canonicalProvenance(left.provenance).localeCompare(
      canonicalProvenance(right.provenance),
    );
    if (source !== 0) return source;
    return JSON.stringify([
      left.sourceText,
      left.format,
      left.kind,
      left.key,
    ]).localeCompare(
      JSON.stringify([
        right.sourceText,
        right.format,
        right.kind,
        right.key,
      ]),
    );
  });
}

function uniqueOrigins(
  declarations: TranslationDeclaration[],
): TranslationDeclarationProvenance[] {
  return [
    ...new Map(
      sortDeclarations(declarations).map(({ provenance }) => [
        canonicalProvenance(provenance),
        provenance,
      ]),
    ).values(),
  ];
}

function itemFromDeclarations(
  appId: string,
  identity: string,
  declarations: TranslationDeclaration[],
): {
  item: TranslationInventoryItem;
  conflict?: TranslationInventoryConflict;
} {
  const ordered = sortDeclarations(declarations);
  const authoritative = ordered.filter(
    ({ provenance }) => provenance.authoritative,
  );
  const contracts = new Set(
    authoritative.map(({ sourceText, format }) =>
      JSON.stringify([sourceText, format]),
    ),
  );
  const preferred = authoritative[0] ?? ordered[0];
  const conflict = contracts.size > 1;
  const status: TranslationInventoryStatus = conflict
    ? 'conflict'
    : authoritative.length
      ? 'confirmed'
      : 'pending';
  const kind = ordered.reduce(
    (current, declaration) =>
      KIND_ORDER[declaration.kind] > KIND_ORDER[current]
        ? declaration.kind
        : current,
    preferred.kind,
  );
  const item: TranslationInventoryItem = {
    identity,
    appId,
    key: preferred.key,
    sourceText: preferred.sourceText,
    kind,
    format: preferred.format,
    status,
    authoritative: authoritative.length > 0,
    exchangeEligible:
      status === 'confirmed' && kind !== 'content',
    buildEligible:
      status === 'confirmed' && kind !== 'content',
    origins: uniqueOrigins(ordered),
    ...(preferred.namespace ? { namespace: preferred.namespace } : {}),
    ...(preferred.description ? { description: preferred.description } : {}),
  };
  return {
    item,
    ...(conflict ? { conflict: { identity, declarations: ordered } } : {}),
  };
}

function buildDeclaration(
  item: TranslationInventoryItem,
): TranslationBuildDeclaration {
  const first = item.origins[0];
  return {
    key: item.key,
    sourceText: item.sourceText,
    format: item.format,
    kind: item.kind,
    status: 'confirmed' satisfies TranslationDeclarationStatus,
    authoritative: true,
    ...(item.namespace ? { namespace: item.namespace } : {}),
    ...(first?.file ? { file: first.file } : {}),
    ...(first?.line ? { line: first.line } : {}),
  };
}

/** Build-facing confirmed subset of a persisted or freshly discovered inventory. */
export function translationBuildDeclarationsFromInventory(
  items: Iterable<TranslationInventoryItem>,
): TranslationBuildDeclaration[] {
  return [...items]
    .filter(({ buildEligible, status }) => buildEligible && status === 'confirmed')
    .map(buildDeclaration)
    .sort((left, right) =>
      JSON.stringify([left.namespace ?? '', left.key]).localeCompare(
        JSON.stringify([right.namespace ?? '', right.key]),
      ),
    );
}

/**
 * Discover and deterministically merge every source. This function is pure
 * with respect to storage: hosts decide how snapshots and lifecycle changes
 * are persisted.
 */
export async function discoverTranslationInventory(
  sources: Iterable<TranslationDiscoverySource>,
  context: TranslationDiscoveryContext,
  options: DiscoverTranslationInventoryOptions = {},
): Promise<TranslationInventorySnapshot> {
  const appId = requiredString(context.appId, 'context.appId');
  const byIdentity = new Map<string, TranslationDeclaration[]>();
  const orderedSources = [...sources].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  for (const source of orderedSources) {
    for await (const raw of source.discover({ ...context, appId })) {
      const declaration = normalizeDeclaration(raw);
      const identity = translationDeclarationIdentity(appId, declaration);
      const values = byIdentity.get(identity) ?? [];
      values.push(declaration);
      byIdentity.set(identity, values);
    }
  }

  const items: TranslationInventoryItem[] = [];
  const conflicts: TranslationInventoryConflict[] = [];
  for (const identity of [...byIdentity.keys()].sort()) {
    const merged = itemFromDeclarations(
      appId,
      identity,
      byIdentity.get(identity)!,
    );
    items.push(merged.item);
    if (merged.conflict) conflicts.push(merged.conflict);
  }

  const currentIdentities = new Set(byIdentity.keys());
  for (const previous of options.previous?.items ?? []) {
    if (
      previous.appId !== appId ||
      currentIdentities.has(previous.identity) ||
      previous.status === 'pending'
    ) {
      continue;
    }
    items.push({
      ...previous,
      status: 'orphaned',
      buildEligible: false,
      exchangeEligible: false,
    });
  }
  items.sort((left, right) => left.identity.localeCompare(right.identity));

  return {
    schemaVersion: 1,
    appId,
    ...(context.branchId ? { branchId: context.branchId } : {}),
    items,
    conflicts,
    buildDeclarations: translationBuildDeclarationsFromInventory(items),
  };
}
