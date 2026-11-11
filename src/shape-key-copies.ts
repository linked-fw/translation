/**
 * Shape keys across apps: every app that uses a shape holds its own copy of each translation key
 * the shape carries (`TranslationKey` with `ofShape`, one per `ofApplication`). These operations
 * act on all of a shape key's copies at once:
 *
 * - {@link listShapeKeyCopies} reads them, with each copy's override state and the languages it
 *   is translated into;
 * - {@link propagateShapeKeySource} gives every copy that follows the shape a new source text;
 *   a copy the app reworded (`overridden`) keeps its own text;
 * - {@link clearShapeKeyOverride} reverts overridden copies (all, or one app's) to the shape's
 *   current text, so they follow the shape again.
 *
 * Every text change goes through {@link upsertTranslationKey}, so it gets a new key version and
 * marks the key's units stale exactly as any other source change does. Like the other key writes,
 * they run on the default dataset (`LinkedStorage`); a host that keeps each app's data in its own
 * dataset runs them in that dataset's context. They decide nothing about who may call them: the
 * host checks that before.
 */
import { TranslationKey } from './shapes/TranslationKey.js';
import { TranslationUnit } from './shapes/TranslationUnit.js';
import {
  upsertTranslationKey,
  type TranslationExecutionOptions,
  type TranslationKeyInput,
  type TranslationKeyWriteContext,
} from './shapes/TranslationProvider.js';

/** One app's copy of a shape key. */
export interface ShapeKeyCopyRecord {
  /** The key node. */
  id: string;
  key: string;
  shapeIri: string;
  appId: string;
  sourceText?: string;
  /** The app reworded this copy; propagation leaves it alone. */
  overridden: boolean;
  /** The shape's text when the app first reworded the copy: what a clear reverts to without a sibling. */
  shapeSource?: string;
  ofProperty?: string;
  fromPackage?: string;
  namespace?: string;
  description?: string;
  kind?: 'ui' | 'content';
  format?: 'simple' | 'icu';
  /** The languages this copy has a unit for, sorted. */
  languages: string[];
}

export interface ShapeKeyQuery {
  /** One shape's keys; omitted, every shape key. */
  shapeIri?: string;
  /** One key name of that shape. */
  key?: string;
}

/** Clear may opt in to treating a failed first key-copy read as nothing to clear. */
export interface ShapeKeyClearExecutionOptions extends TranslationExecutionOptions {
  readonly skipInitialKeyReadFailure?: boolean;
}

const iri = (value: unknown): string | undefined =>
  typeof value === 'string' ? value || undefined : (value as { id?: string } | undefined)?.id || undefined;
const text = (value: unknown): string | undefined =>
  value === undefined || value === null || value === '' ? undefined : String(value);
/** The flag as stored: a boolean, or the string "true" an older writer left. */
const isOverridden = (value: unknown): boolean => value === true || value === 'true';

/** The node a key write addresses: `upsertTranslationKey` keys a copy by its app and key name. */
const keyIri = (appId: string, key: string): string =>
  `${appId.replace(/\/$/, '')}/translation/key/${encodeURIComponent(key)}`;

const keyWhere = (query: ShapeKeyQuery) => (k: any) => {
  const shape = query.shapeIri ? k.ofShape.equals({ id: query.shapeIri }) : k.ofShape.isDefined();
  return query.key === undefined ? shape : shape.and(k.key.equals(query.key));
};

function keyCopiesQuery(query: ShapeKeyQuery) {
  return TranslationKey.select((k) => [
    k.key,
    k.ofShape,
    k.ofApplication,
    k.sourceText,
    k.overridden,
    k.shapeSource,
    k.ofProperty,
    k.fromPackage,
    k.namespace,
    k.description,
    k.kind,
    k.format,
  ]).where(keyWhere(query) as any);
}

function unitLanguagesQuery(query: ShapeKeyQuery) {
  return TranslationUnit.select((u) => [u.ofKey, u.language]).where(
    ((u: any) => keyWhere(query)(u.ofKey)) as any,
  );
}

function copiesFrom(keys: unknown, units: unknown): ShapeKeyCopyRecord[] {
  const languagesOf = new Map<string, Set<string>>();
  for (const unit of (units ?? []) as any[]) {
    const keyId = iri(unit.ofKey);
    const language = text(unit.language);
    if (!keyId || !language) continue;
    const set = languagesOf.get(keyId) ?? new Set<string>();
    set.add(language);
    languagesOf.set(keyId, set);
  }
  const copies: ShapeKeyCopyRecord[] = [];
  for (const row of (keys ?? []) as any[]) {
    const id = iri(row.id);
    const key = text(row.key);
    const shapeIri = iri(row.ofShape);
    const appId = iri(row.ofApplication);
    if (!id || !key || !shapeIri || !appId) continue;
    copies.push({
      id,
      key,
      shapeIri,
      appId,
      sourceText: text(row.sourceText),
      overridden: isOverridden(row.overridden),
      shapeSource: text(row.shapeSource),
      ofProperty: iri(row.ofProperty),
      fromPackage: text(row.fromPackage),
      namespace: text(row.namespace),
      description: text(row.description),
      kind: row.kind === 'content' ? 'content' : row.kind === 'ui' ? 'ui' : undefined,
      format: row.format === 'icu' ? 'icu' : row.format === 'simple' ? 'simple' : undefined,
      languages: [...(languagesOf.get(id) ?? [])].sort(),
    });
  }
  return copies;
}

/**
 * The copies of the shape keys `query` names, one per app. A key that names no app is not a
 * copy and is left out.
 */
export async function listShapeKeyCopies(
  query: ShapeKeyQuery = {},
  execution?: TranslationExecutionOptions,
): Promise<ShapeKeyCopyRecord[]> {
  const dataset = execution?.dataset;
  const keyQuery = keyCopiesQuery(query);
  const unitQuery = unitLanguagesQuery(query);
  const [keys, units] = await Promise.all([
    dataset ? keyQuery.exec(dataset) : keyQuery,
    dataset ? unitQuery.exec(dataset) : unitQuery,
  ]);
  return copiesFrom(keys, units);
}

/** The copy's own declaration, so a text write keeps what the copy declares. */
function asKeyInput(copy: ShapeKeyCopyRecord, sourceText: string): TranslationKeyInput {
  if (copy.id !== keyIri(copy.appId, copy.key)) {
    // A key write addresses the app's key node; writing this copy there would create a second key.
    throw new Error(`Shape key copy ${copy.id} is not at its app's key node; it was not written.`);
  }
  return {
    appId: copy.appId,
    key: copy.key,
    sourceText,
    namespace: copy.namespace,
    description: copy.description,
    kind: copy.kind,
    ofShape: copy.shapeIri,
    ofProperty: copy.ofProperty,
    fromPackage: copy.fromPackage,
    format: copy.format,
  };
}

const appsOf = (copies: readonly ShapeKeyCopyRecord[]): string[] => [...new Set(copies.map((c) => c.appId))].sort();

export interface ShapeKeyPropagation {
  /** Apps whose copy now has the new text (or had it already). */
  updatedApps: string[];
  /** Apps whose copy is overridden and was left alone. */
  skippedOverrides: string[];
}

/**
 * Give one shape key a new source text in every app whose copy follows the shape. Overridden
 * copies keep their text. A copy whose text changes gets a new key version and stale units.
 */
export async function propagateShapeKeySource(
  data: { shapeIri: string; key: string; sourceText: string },
  authorship: Pick<TranslationKeyWriteContext, 'createdBy'> = {},
  execution?: TranslationExecutionOptions,
): Promise<ShapeKeyPropagation> {
  const dataset = execution?.dataset;
  const sourceText = data.sourceText?.trim();
  if (!sourceText) throw new Error('sourceText is required.');
  const copies = await listShapeKeyCopies(
    { shapeIri: data.shapeIri, key: data.key },
    dataset === undefined ? undefined : { dataset },
  );
  const following = copies.filter((c) => !c.overridden);
  for (const copy of following) {
    // A declaration refresh: it never marks the copy overridden.
    const input = asKeyInput(copy, sourceText);
    const write = { ...authorship, source: 'declaration-sync' as const };
    await (dataset === undefined
      ? upsertTranslationKey(input, write)
      : upsertTranslationKey(input, write, { dataset }));
  }
  return { updatedApps: appsOf(following), skippedOverrides: appsOf(copies.filter((c) => c.overridden)) };
}

/**
 * Clear the override on one shape key's copies: every overridden copy, or only `appId`'s. Each
 * reverts to the text of a copy that follows the shape, or, when none does, to its own snapshot
 * (`shapeSource`); with neither, it keeps its own text. The flag is reset (`overridden: false`)
 * and the snapshot removed, so the copy follows the shape again. Returns the apps cleared; a copy
 * with no text at all is not written and not counted.
 */
export async function clearShapeKeyOverride(
  data: { shapeIri: string; key: string; appId?: string },
  authorship: Pick<TranslationKeyWriteContext, 'createdBy'> = {},
  execution?: ShapeKeyClearExecutionOptions,
): Promise<{ clearedApps: string[] }> {
  const dataset = execution?.dataset;
  const skipInitialKeyReadFailure = execution?.skipInitialKeyReadFailure === true;
  const query = { shapeIri: data.shapeIri, key: data.key };
  let copies: ShapeKeyCopyRecord[];
  if (skipInitialKeyReadFailure) {
    const keyQuery = keyCopiesQuery(query);
    let keys: unknown;
    try {
      keys = await (dataset ? keyQuery.exec(dataset) : keyQuery);
    } catch {
      return { clearedApps: [] };
    }
    const unitQuery = unitLanguagesQuery(query);
    const units = await (dataset ? unitQuery.exec(dataset) : unitQuery);
    copies = copiesFrom(keys, units);
  } else {
    copies = await listShapeKeyCopies(query, dataset === undefined ? undefined : { dataset });
  }
  const overridden = copies.filter((c) => c.overridden && (data.appId === undefined || c.appId === data.appId));
  const canonical = copies.find((c) => !c.overridden && c.sourceText !== undefined)?.sourceText;
  const cleared: ShapeKeyCopyRecord[] = [];
  for (const copy of overridden) {
    const next = canonical ?? copy.shapeSource ?? copy.sourceText;
    if (next === undefined) continue;
    // An explicit app edit: the only write that may reset the override flag.
    const input = { ...asKeyInput(copy, next), overridden: false as const };
    const write = { ...authorship, source: 'app-edit' as const };
    await (dataset === undefined
      ? upsertTranslationKey(input, write)
      : upsertTranslationKey(input, write, { dataset }));
    if (copy.shapeSource !== undefined) {
      // In the mutation DSL an explicit `undefined` removes the value.
      const removal = TranslationKey.update({ shapeSource: undefined } as any).for({ id: copy.id } as any);
      await (dataset ? removal.exec(dataset) : removal);
    }
    cleared.push(copy);
  }
  return { clearedApps: appsOf(cleared) };
}
