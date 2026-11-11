/**
 * Shape keys across apps: what the operations read, and which key writes they make. The writes
 * themselves are `upsertTranslationKey` (versioning and unit staling are its own, tested in
 * translation-version-writes); here it is a spy, and the reads answer fixed rows.
 *
 * Transport-spy scope: the select/update doubles are lazy thenables with `exec(target)`. A real
 * `InMemoryDataset` refuses the nested unit read these queries use, so this file does not claim
 * store execution. That check is a later real-store gate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDataset } from '@_linked/core/interfaces/IDataset';
import type { CreateQuery } from '@_linked/core/queries/CreateQuery';
import type { CreateResult, GraphQuery, GraphResult, UpdateResult } from '@_linked/core/queries/IntermediateRepresentation';
import type { DeleteQuery, DeleteResponse } from '@_linked/core/queries/DeleteQuery';
import type { ReadQuery, ReadResult } from '@_linked/core/queries/readQuery';
import type { UpdateQuery } from '@_linked/core/queries/UpdateQuery';

vi.mock('../src/shapes/TranslationProvider.js', () => ({
  upsertTranslationKey: vi.fn(async () => ({ id: 'k', versionId: 'v', versionCreated: true })),
}));

import { TranslationKey } from '../src/shapes/TranslationKey.js';
import { TranslationUnit } from '../src/shapes/TranslationUnit.js';
import { upsertTranslationKey } from '../src/shapes/TranslationProvider.js';
import {
  clearShapeKeyOverride,
  listShapeKeyCopies,
  propagateShapeKeySource,
} from '../src/shape-key-copies.js';

const SHAPE = 'https://package.example/shape/Person';
const app = (name: string) => `https://example.test/app/${name}`;
const keyId = (name: string, key = 'person.givenName') =>
  `${app(name)}/translation/key/${encodeURIComponent(key)}`;

const copyRow = (name: string, extra: Record<string, unknown> = {}) => ({
  id: keyId(name),
  key: 'person.givenName',
  ofShape: { id: SHAPE },
  ofApplication: { id: app(name) },
  sourceText: 'Given name',
  fromPackage: '@package/people',
  namespace: 'person',
  kind: 'ui',
  format: 'simple',
  ...extra,
});

let keyRows: Array<Record<string, unknown>>;
let unitRows: Array<Record<string, unknown>>;
let keyWhere: ReturnType<typeof vi.fn>;
let unitWhere: ReturnType<typeof vi.fn>;
let keyUpdate: ReturnType<typeof vi.fn>;
let keyUpdateFor: ReturnType<typeof vi.fn>;
let keyExecTargets: IDataset[];
let unitExecTargets: IDataset[];
let snapshotExecTargets: IDataset[];
let keyFailure: Error | undefined;
let unitFailure: Error | undefined;
let snapshotFailure: Error | undefined;
let releaseKeyRead: () => void;
let keyGate: Promise<void> | undefined;

/** Identity-only dataset. The spies record it; they never call its query methods. */
class TargetDataset implements IDataset {
  constructor(readonly label: string) {}
  readQuery<Q extends ReadQuery>(_query: Q): Promise<ReadResult<Q>> {
    return Promise.reject(new Error(this.label));
  }
  updateQuery(_query: UpdateQuery): Promise<UpdateResult> {
    return Promise.reject(new Error(this.label));
  }
  createQuery(_query: CreateQuery): Promise<CreateResult> {
    return Promise.reject(new Error(this.label));
  }
  deleteQuery(_query: DeleteQuery): Promise<DeleteResponse> {
    return Promise.reject(new Error(this.label));
  }
  graphQuery(_query: GraphQuery): Promise<GraphResult> {
    return Promise.reject(new Error(this.label));
  }
}

interface LazyQuery {
  exec(target: IDataset): Promise<unknown>;
  then<T>(
    onfulfilled?: ((value: unknown) => T | PromiseLike<T>) | null,
    onrejected?: ((reason: unknown) => T | PromiseLike<T>) | null,
  ): Promise<T>;
}

function lazyQuery(
  record: (target: IDataset | undefined) => void,
  produce: () => Promise<unknown>,
): LazyQuery {
  return {
    exec(target) {
      record(target);
      return produce();
    },
    then(onfulfilled, onrejected) {
      record(undefined);
      return produce().then(onfulfilled, onrejected);
    },
  };
}

beforeEach(() => {
  // a follows the shape; b reworded it (boolean flag, snapshot); c reworded it (string flag).
  keyRows = [
    copyRow('a'),
    copyRow('b', { sourceText: 'First name', overridden: true, shapeSource: 'Given name (then)' }),
    copyRow('c', { sourceText: 'Forename', overridden: 'true' }),
  ];
  unitRows = [
    { id: 'u1', ofKey: { id: keyId('a') }, language: 'nl' },
    { id: 'u2', ofKey: { id: keyId('a') }, language: 'de' },
    { id: 'u3', ofKey: { id: keyId('b') }, language: 'nl' },
  ];
  keyExecTargets = [];
  unitExecTargets = [];
  snapshotExecTargets = [];
  keyFailure = undefined;
  unitFailure = undefined;
  snapshotFailure = undefined;
  keyGate = undefined;
  releaseKeyRead = () => {};
  keyWhere = vi.fn(() =>
    lazyQuery(
      (target) => {
        if (target) keyExecTargets.push(target);
      },
      async () => {
        if (keyGate) await keyGate;
        if (keyFailure) throw keyFailure;
        return keyRows;
      },
    ),
  );
  unitWhere = vi.fn(() =>
    lazyQuery(
      (target) => {
        if (target) unitExecTargets.push(target);
      },
      async () => {
        if (unitFailure) throw unitFailure;
        return unitRows;
      },
    ),
  );
  vi.spyOn(TranslationKey, 'select').mockReturnValue({ where: keyWhere } as any);
  vi.spyOn(TranslationUnit, 'select').mockReturnValue({ where: unitWhere } as any);
  keyUpdateFor = vi.fn(() =>
    lazyQuery(
      (target) => {
        if (target) snapshotExecTargets.push(target);
      },
      async () => {
        if (snapshotFailure) throw snapshotFailure;
        return {};
      },
    ),
  );
  keyUpdate = vi.spyOn(TranslationKey, 'update').mockReturnValue({ for: keyUpdateFor } as any) as any;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(upsertTranslationKey).mockReset();
  vi.mocked(upsertTranslationKey).mockImplementation(async () => ({
    id: 'k',
    versionId: 'v',
    versionCreated: true,
  }));
});

const written = () => vi.mocked(upsertTranslationKey).mock.calls.map(([data, ctx]) => ({ data, ctx }));

describe('listShapeKeyCopies', () => {
  it('reads each app’s copy with its override state, snapshot and languages', async () => {
    const copies = await listShapeKeyCopies({ shapeIri: SHAPE, key: 'person.givenName' });
    expect(copies.map((c) => [c.appId, c.overridden, c.languages])).toEqual([
      [app('a'), false, ['de', 'nl']],
      [app('b'), true, ['nl']],
      [app('c'), true, []],
    ]);
    expect(copies[1]).toMatchObject({ id: keyId('b'), shapeSource: 'Given name (then)', fromPackage: '@package/people' });
  });

  it('leaves out a key that names no shape or no app', async () => {
    keyRows.push(copyRow('d', { ofApplication: undefined }), copyRow('e', { ofShape: undefined }));
    expect((await listShapeKeyCopies()).map((c) => c.appId)).toEqual([app('a'), app('b'), app('c')]);
  });

  it('filters on the shape and the key name, or on any shape', async () => {
    // A stand-in for the query proxy that spells out the condition it is given.
    type Cond = { label: string; and(other: Cond): Cond };
    const cond = (label: string): Cond => ({ label, and: (other) => cond(`${label} AND ${other.label}`) });
    const k = {
      ofShape: { equals: (v: { id: string }) => cond(`ofShape = ${v.id}`), isDefined: () => cond('ofShape is set') },
      key: { equals: (v: string) => cond(`key = ${v}`) },
    };
    await listShapeKeyCopies({ shapeIri: SHAPE, key: 'person.givenName' });
    await listShapeKeyCopies();
    expect(keyWhere.mock.calls.map(([where]) => (where as (k: unknown) => Cond)(k).label)).toEqual([
      `ofShape = ${SHAPE} AND key = person.givenName`,
      'ofShape is set',
    ]);
  });
});

describe('propagateShapeKeySource', () => {
  it('writes every copy that follows the shape as a declaration refresh, and skips both overrides', async () => {
    expect(
      await propagateShapeKeySource({ shapeIri: SHAPE, key: 'person.givenName', sourceText: ' Given name (new) ' }, { createdBy: 'https://id.example/me' })
    ).toEqual({ updatedApps: [app('a')], skippedOverrides: [app('b'), app('c')] });
    expect(written()).toEqual([
      {
        data: {
          appId: app('a'),
          key: 'person.givenName',
          sourceText: 'Given name (new)',
          namespace: 'person',
          description: undefined,
          kind: 'ui',
          ofShape: SHAPE,
          ofProperty: undefined,
          fromPackage: '@package/people',
          format: 'simple',
        },
        ctx: { createdBy: 'https://id.example/me', source: 'declaration-sync' },
      },
    ]);
  });

  it('refuses an empty source text before writing', async () => {
    await expect(propagateShapeKeySource({ shapeIri: SHAPE, key: 'person.givenName', sourceText: ' ' })).rejects.toThrow(/sourceText is required/);
    expect(written()).toEqual([]);
  });

  it('refuses a copy that is not at its app’s key node, rather than writing a second key', async () => {
    keyRows[0] = copyRow('a', { id: 'https://elsewhere.example/key/1' });
    await expect(propagateShapeKeySource({ shapeIri: SHAPE, key: 'person.givenName', sourceText: 'New' })).rejects.toThrow(/not at its app's key node/);
    expect(written()).toEqual([]);
  });
});

describe('clearShapeKeyOverride', () => {
  it('reverts every override to the sibling that follows the shape, resets the flag and drops the snapshot', async () => {
    expect(await clearShapeKeyOverride({ shapeIri: SHAPE, key: 'person.givenName' })).toEqual({ clearedApps: [app('b'), app('c')] });
    expect(written().map(({ data, ctx }) => [data.appId, data.sourceText, data.overridden, ctx.source])).toEqual([
      [app('b'), 'Given name', false, 'app-edit'],
      [app('c'), 'Given name', false, 'app-edit'],
    ]);
    // Only b had a snapshot to remove.
    expect(keyUpdate).toHaveBeenCalledWith({ shapeSource: undefined });
    expect(keyUpdateFor.mock.calls).toEqual([[{ id: keyId('b') }]]);
  });

  it('without a copy that follows the shape, each override reverts to its own snapshot, else keeps its text', async () => {
    keyRows.shift();
    await clearShapeKeyOverride({ shapeIri: SHAPE, key: 'person.givenName' });
    expect(written().map(({ data }) => [data.appId, data.sourceText, data.overridden])).toEqual([
      [app('b'), 'Given name (then)', false],
      [app('c'), 'Forename', false],
    ]);
  });

  it('one app’s clear writes that app’s copy only, and an app without an override clears nothing', async () => {
    expect(await clearShapeKeyOverride({ shapeIri: SHAPE, key: 'person.givenName', appId: app('b') })).toEqual({ clearedApps: [app('b')] });
    expect(written().map(({ data }) => data.appId)).toEqual([app('b')]);
    vi.mocked(upsertTranslationKey).mockClear();
    expect(await clearShapeKeyOverride({ shapeIri: SHAPE, key: 'person.givenName', appId: app('a') })).toEqual({ clearedApps: [] });
    expect(written()).toEqual([]);
  });

  it('a copy with no text at all is not written and not counted', async () => {
    keyRows = [copyRow('c', { sourceText: undefined, overridden: true })];
    expect(await clearShapeKeyOverride({ shapeIri: SHAPE, key: 'person.givenName' })).toEqual({ clearedApps: [] });
    expect(written()).toEqual([]);
  });
});

describe('explicit dataset transport', () => {
  const targetA = new TargetDataset('target-a');
  const sentinel = new TargetDataset('default-sentinel');

  function holdKeyReads() {
    keyGate = new Promise((resolve) => {
      releaseKeyRead = resolve;
    });
  }

  it('sends list, propagate, and clear queries and the snapshot removal to the target only', async () => {
    expect(await listShapeKeyCopies({ shapeIri: SHAPE, key: 'person.givenName' }, { dataset: targetA })).toHaveLength(3);
    expect(keyExecTargets).toEqual([targetA]);
    expect(unitExecTargets).toEqual([targetA]);
    expect(keyExecTargets).not.toContain(sentinel);
    expect(unitExecTargets).not.toContain(sentinel);

    await propagateShapeKeySource(
      { shapeIri: SHAPE, key: 'person.givenName', sourceText: 'Given name (new)' },
      {},
      { dataset: targetA },
    );
    const propagated = vi.mocked(upsertTranslationKey).mock.calls;
    expect(propagated).toHaveLength(1);
    expect(propagated[0]?.[2]).toEqual({ dataset: targetA });
    expect(keyExecTargets.every((dataset) => dataset === targetA)).toBe(true);
    expect(unitExecTargets.every((dataset) => dataset === targetA)).toBe(true);

    await clearShapeKeyOverride({ shapeIri: SHAPE, key: 'person.givenName' }, {}, { dataset: targetA });
    const cleared = vi.mocked(upsertTranslationKey).mock.calls.slice(1);
    expect(cleared.map((call) => call[2])).toEqual([{ dataset: targetA }, { dataset: targetA }]);
    expect(snapshotExecTargets).toEqual([targetA]);
    expect(snapshotExecTargets).not.toContain(sentinel);
  });

  it('reads each public execution.dataset getter once', async () => {
    const once = async (
      run: (execution: { readonly dataset?: IDataset }) => Promise<unknown>,
    ) => {
      let active: IDataset = targetA;
      let reads = 0;
      const pending = run({
        get dataset() {
          reads += 1;
          return active;
        },
      });
      expect(reads).toBe(1);
      active = sentinel;
      await pending;
      expect(reads).toBe(1);
    };

    await once((execution) => listShapeKeyCopies({ shapeIri: SHAPE }, execution));
    expect(keyExecTargets).toEqual([targetA]);
    expect(unitExecTargets).toEqual([targetA]);

    keyExecTargets = [];
    unitExecTargets = [];
    await once((execution) =>
      propagateShapeKeySource(
        { shapeIri: SHAPE, key: 'person.givenName', sourceText: 'Next' },
        {},
        execution,
      ),
    );
    expect(vi.mocked(upsertTranslationKey).mock.calls.at(-1)?.[2]).toEqual({ dataset: targetA });

    keyExecTargets = [];
    unitExecTargets = [];
    snapshotExecTargets = [];
    await once((execution) =>
      clearShapeKeyOverride({ shapeIri: SHAPE, key: 'person.givenName' }, {}, execution),
    );
    expect(snapshotExecTargets).toEqual([targetA]);
    expect(vi.mocked(upsertTranslationKey).mock.calls.at(-1)?.[2]).toEqual({ dataset: targetA });
  });

  it('returns no apps when the opted-in first key read fails, and does not start a later query', async () => {
    const failure = new Error('first-key-failed');
    keyFailure = failure;
    await expect(
      clearShapeKeyOverride(
        { shapeIri: SHAPE, key: 'person.givenName' },
        {},
        { dataset: targetA, skipInitialKeyReadFailure: true },
      ),
    ).resolves.toEqual({ clearedApps: [] });
    expect(keyWhere).toHaveBeenCalledOnce();
    expect(keyExecTargets).toEqual([targetA]);
    expect(unitWhere).not.toHaveBeenCalled();
    expect(upsertTranslationKey).not.toHaveBeenCalled();
    expect(keyUpdate).not.toHaveBeenCalled();
  });

  it('rejects the original key error when the skip flag is absent or false', async () => {
    const failure = new Error('key-read-failed');
    keyFailure = failure;
    await expect(clearShapeKeyOverride({ shapeIri: SHAPE, key: 'person.givenName' })).rejects.toBe(failure);
    await expect(
      clearShapeKeyOverride({ shapeIri: SHAPE, key: 'person.givenName' }, {}, { dataset: targetA }),
    ).rejects.toBe(failure);
    await expect(
      clearShapeKeyOverride(
        { shapeIri: SHAPE, key: 'person.givenName' },
        {},
        { dataset: targetA, skipInitialKeyReadFailure: false },
      ),
    ).rejects.toBe(failure);
  });

  it('executes the successful first key read once and reuses those rows', async () => {
    await clearShapeKeyOverride(
      { shapeIri: SHAPE, key: 'person.givenName' },
      {},
      { dataset: targetA, skipInitialKeyReadFailure: true },
    );
    expect(keyWhere).toHaveBeenCalledOnce();
    expect(keyExecTargets).toEqual([targetA]);
    expect(unitWhere).toHaveBeenCalledOnce();
    expect(unitExecTargets).toEqual([targetA]);
    expect(vi.mocked(upsertTranslationKey).mock.calls.map((call) => call[0].appId)).toEqual([
      app('b'),
      app('c'),
    ]);
  });

  it('rejects a later unit, upsert, or snapshot failure unchanged', async () => {
    const unitError = new Error('unit-read-failed');
    unitFailure = unitError;
    await expect(
      clearShapeKeyOverride(
        { shapeIri: SHAPE, key: 'person.givenName' },
        {},
        { dataset: targetA, skipInitialKeyReadFailure: true },
      ),
    ).rejects.toBe(unitError);
    expect(upsertTranslationKey).not.toHaveBeenCalled();
    expect(keyUpdate).not.toHaveBeenCalled();

    unitFailure = undefined;
    const upsertError = new Error('upsert-failed');
    vi.mocked(upsertTranslationKey).mockRejectedValueOnce(upsertError);
    await expect(
      clearShapeKeyOverride(
        { shapeIri: SHAPE, key: 'person.givenName' },
        {},
        { dataset: targetA, skipInitialKeyReadFailure: true },
      ),
    ).rejects.toBe(upsertError);
    expect(keyUpdate).not.toHaveBeenCalled();

    const snapshotError = new Error('snapshot-removal-failed');
    snapshotFailure = snapshotError;
    vi.mocked(upsertTranslationKey).mockResolvedValue({
      id: 'k',
      versionId: 'v',
      versionCreated: true,
    });
    await expect(
      clearShapeKeyOverride(
        { shapeIri: SHAPE, key: 'person.givenName' },
        {},
        { dataset: targetA, skipInitialKeyReadFailure: true },
      ),
    ).rejects.toBe(snapshotError);
  });

  it('keeps the captured dataset and skip flag after the caller mutates them during the first read', async () => {
    holdKeyReads();
    let active: IDataset = targetA;
    let skip = true;
    let datasetReads = 0;
    let skipReads = 0;
    const execution = {
      get dataset() {
        datasetReads += 1;
        return active;
      },
      get skipInitialKeyReadFailure() {
        skipReads += 1;
        return skip;
      },
    };
    const pending = clearShapeKeyOverride(
      { shapeIri: SHAPE, key: 'person.givenName' },
      {},
      execution,
    );
    expect(datasetReads).toBe(1);
    expect(skipReads).toBe(1);
    expect(keyExecTargets).toEqual([targetA]);
    active = sentinel;
    skip = false;
    releaseKeyRead();
    await pending;
    expect(datasetReads).toBe(1);
    expect(skipReads).toBe(1);
    expect(keyExecTargets).toEqual([targetA]);
    expect(unitExecTargets).toEqual([targetA]);
    expect(snapshotExecTargets).toEqual([targetA]);
    expect(vi.mocked(upsertTranslationKey).mock.calls.map((call) => call[2])).toEqual([
      { dataset: targetA },
      { dataset: targetA },
    ]);
    expect(keyExecTargets).not.toContain(sentinel);
    expect(unitExecTargets).not.toContain(sentinel);
    expect(snapshotExecTargets).not.toContain(sentinel);
  });

  it('rejects a default unit failure while the key read is still held, without a second key read', async () => {
    holdKeyReads();
    const unitError = new Error('unit-failed-first');
    unitFailure = unitError;
    const pending = listShapeKeyCopies({ shapeIri: SHAPE });
    const outcome = await Promise.race([
      pending.then(
        () => 'resolved',
        (error: unknown) => error,
      ),
      new Promise((resolve) => setTimeout(() => resolve('still-held'), 50)),
    ]);
    expect(outcome).toBe(unitError);
    expect(keyWhere).toHaveBeenCalledOnce();
    expect(unitWhere).toHaveBeenCalledOnce();
    releaseKeyRead();
  });
});
