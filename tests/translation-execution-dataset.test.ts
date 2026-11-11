// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IDataset } from '@_linked/core/interfaces/IDataset';
import type { CreateQuery } from '@_linked/core/queries/CreateQuery';
import type { CreateResult, GraphQuery, GraphResult, UpdateResult } from '@_linked/core/queries/IntermediateRepresentation';
import type { DeleteQuery, DeleteResponse } from '@_linked/core/queries/DeleteQuery';
import type { ReadQuery, ReadResult } from '@_linked/core/queries/readQuery';
import type { UpdateQuery } from '@_linked/core/queries/UpdateQuery';
import {
  InMemoryDataset,
  InMemoryQueryRefusal,
} from '@_linked/core/memory/InMemoryDataset';
import { LinkedStorage } from '@_linked/core/utils/LinkedStorage';
import {
  upsertTranslationKey,
  upsertTranslationUnit,
  type TranslationExecutionOptions,
} from '../src/shapes/TranslationProvider.js';
import { TranslationKey } from '../src/shapes/TranslationKey.js';
import { TranslationKeyVersion } from '../src/shapes/TranslationKeyVersion.js';
import { TranslationUnit } from '../src/shapes/TranslationUnit.js';

const APP = 'https://example.test/app';
const KEY = 'nav.home';
const KEY_ID = `${APP}/translation/key/${encodeURIComponent(KEY)}`;

function nodeId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = value.id;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}

class RefusingDataset implements IDataset {
  constructor(private readonly refusal: Error) {}

  readQuery<Q extends ReadQuery>(_query: Q): Promise<ReadResult<Q>> {
    return Promise.reject(this.refusal);
  }
  updateQuery(_query: UpdateQuery): Promise<UpdateResult> {
    return Promise.reject(this.refusal);
  }
  createQuery(_query: CreateQuery): Promise<CreateResult> {
    return Promise.reject(this.refusal);
  }
  deleteQuery(_query: DeleteQuery): Promise<DeleteResponse> {
    return Promise.reject(this.refusal);
  }
  graphQuery(_query: GraphQuery): Promise<GraphResult> {
    return Promise.reject(this.refusal);
  }
}

class HoldingDataset extends InMemoryDataset {
  private readonly gate: Promise<void>;
  release: () => void = () => {};

  constructor(id: string) {
    super({ id });
    this.gate = new Promise((resolve) => {
      this.release = resolve;
    });
  }

  override readQuery<Q extends ReadQuery>(query: Q): Promise<ReadResult<Q>> {
    return this.gate.then(() => super.readQuery(query));
  }
}

async function keysIn(dataset: IDataset) {
  return TranslationKey.select((key) => [
    key.key,
    key.sourceText,
    key.currentVersion,
  ]).exec(dataset);
}

async function versionsIn(dataset: IDataset) {
  return TranslationKeyVersion.select((version) => [
    version.versionId,
    version.sourceText,
    version.supersedes,
  ])
    .where((version) => version.ofKey.equals({ id: KEY_ID }))
    .exec(dataset);
}

async function unitsIn(dataset: IDataset) {
  return TranslationUnit.select((unit) => [
    unit.language,
    unit.text,
    unit.state,
  ])
    .where((unit) => unit.ofKey.equals({ id: KEY_ID }))
    .exec(dataset);
}

describe('upsertTranslationKey explicit dataset', () => {
  let previous: IDataset;

  beforeEach(() => {
    previous = LinkedStorage.getDefaultDataset();
  });

  afterEach(() => {
    LinkedStorage.setDefaultDataset(previous);
  });

  it('writes a new key, its version, and the currentVersion pointer only on the target', async () => {
    const target = new InMemoryDataset({ id: 'target-a' });
    const sentinel = new InMemoryDataset({ id: 'default-sentinel' });
    LinkedStorage.setDefaultDataset(sentinel);
    const execution: TranslationExecutionOptions = { dataset: target };

    const result = await upsertTranslationKey(
      { appId: APP, key: KEY, sourceText: 'Home' },
      {},
      execution,
    );

    expect(result.id).toBe(KEY_ID);
    expect(result.versionCreated).toBe(true);
    const targetKeys = await keysIn(target);
    expect(targetKeys).toEqual([
      expect.objectContaining({
        key: KEY,
        sourceText: 'Home',
      }),
    ]);
    expect(nodeId(targetKeys[0]?.currentVersion)).toBe(result.versionId);
    const versions = await versionsIn(target);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.sourceText).toBe('Home');
    expect(await keysIn(sentinel)).toEqual([]);
    expect(await versionsIn(sentinel)).toEqual([]);
  });

  it('writes the next version on the target and refuses the bulk stale update without falling back', async () => {
    const target = new InMemoryDataset({ id: 'target-a' });
    const sentinel = new InMemoryDataset({ id: 'default-sentinel' });
    LinkedStorage.setDefaultDataset(sentinel);
    const execution: TranslationExecutionOptions = { dataset: target };
    const first = await upsertTranslationKey(
      { appId: APP, key: KEY, sourceText: 'Home' },
      {},
      execution,
    );
    LinkedStorage.setDefaultDataset(target);
    try {
      await upsertTranslationUnit({
        appId: APP,
        key: KEY,
        language: 'es',
        text: 'Inicio',
        state: 'reviewed',
      });
    } finally {
      LinkedStorage.setDefaultDataset(sentinel);
    }

    await expect(
      upsertTranslationKey(
        { appId: APP, key: KEY, sourceText: 'Welcome' },
        {},
        execution,
      ),
    ).rejects.toBeInstanceOf(InMemoryQueryRefusal);
    const targetKeys = await keysIn(target);
    expect(targetKeys[0]?.sourceText).toBe('Welcome');
    const nextVersionId = nodeId(targetKeys[0]?.currentVersion);
    expect(nextVersionId).toBeTruthy();
    expect(nextVersionId).not.toBe(first.versionId);
    const versions = await versionsIn(target);
    expect(versions).toHaveLength(2);
    expect(versions.map((version) => version.sourceText).sort()).toEqual([
      'Home',
      'Welcome',
    ]);
    const units = await unitsIn(target);
    expect(units).toEqual([
      expect.objectContaining({ language: 'es', text: 'Inicio', state: 'reviewed' }),
    ]);
    expect(await keysIn(sentinel)).toEqual([]);
    expect(await versionsIn(sentinel)).toEqual([]);
    expect(await unitsIn(sentinel)).toEqual([]);
  });

  it('leaves an unchanged source on its existing version and does not stale units', async () => {
    const target = new InMemoryDataset({ id: 'target-a' });
    const sentinel = new InMemoryDataset({ id: 'default-sentinel' });
    LinkedStorage.setDefaultDataset(sentinel);
    const execution: TranslationExecutionOptions = { dataset: target };
    const first = await upsertTranslationKey(
      { appId: APP, key: KEY, sourceText: 'Home' },
      {},
      execution,
    );
    LinkedStorage.setDefaultDataset(target);
    try {
      await upsertTranslationUnit({
        appId: APP,
        key: KEY,
        language: 'es',
        text: 'Inicio',
        state: 'reviewed',
      });
    } finally {
      LinkedStorage.setDefaultDataset(sentinel);
    }

    const again = await upsertTranslationKey(
      { appId: APP, key: KEY, sourceText: 'Home' },
      {},
      execution,
    );

    expect(again).toEqual({
      id: KEY_ID,
      versionId: first.versionId,
      versionCreated: false,
    });
    expect(await versionsIn(target)).toHaveLength(1);
    expect(await unitsIn(target)).toEqual([
      expect.objectContaining({ language: 'es', state: 'reviewed' }),
    ]);
    expect(await keysIn(sentinel)).toEqual([]);
  });

  it('rejects with the selected dataset error and writes nothing to the default dataset', async () => {
    const sentinel = new InMemoryDataset({ id: 'default-sentinel' });
    LinkedStorage.setDefaultDataset(sentinel);
    const refusal = new Error('selected-store-refused');
    const execution: TranslationExecutionOptions = {
      dataset: new RefusingDataset(refusal),
    };

    await expect(
      upsertTranslationKey(
        { appId: APP, key: KEY, sourceText: 'Home' },
        {},
        execution,
      ),
    ).rejects.toThrow('selected-store-refused');
    expect(await keysIn(sentinel)).toEqual([]);
    expect(await versionsIn(sentinel)).toEqual([]);
  });

  it('reads execution.dataset once and keeps that dataset after the caller mutates it', async () => {
    const holding = new HoldingDataset('target-a');
    const sentinel = new InMemoryDataset({ id: 'default-sentinel' });
    LinkedStorage.setDefaultDataset(sentinel);
    let active: IDataset = holding;
    let reads = 0;
    const execution: TranslationExecutionOptions = {
      get dataset() {
        reads += 1;
        return active;
      },
    };

    const pending = upsertTranslationKey(
      { appId: APP, key: KEY, sourceText: 'Home' },
      {},
      execution,
    );
    expect(reads).toBe(1);
    active = sentinel;
    holding.release();
    const result = await pending;

    expect(reads).toBe(1);
    expect(result.versionCreated).toBe(true);
    expect(await keysIn(holding)).toHaveLength(1);
    expect(nodeId((await keysIn(holding))[0]?.currentVersion)).toBe(
      result.versionId,
    );
    expect(await versionsIn(holding)).toHaveLength(1);
    expect(await keysIn(sentinel)).toEqual([]);
    expect(await versionsIn(sentinel)).toEqual([]);
  });

  it('keeps two concurrent upserts on distinct datasets apart', async () => {
    const targetA = new InMemoryDataset({ id: 'target-a' });
    const targetB = new InMemoryDataset({ id: 'target-b' });
    const sentinel = new InMemoryDataset({ id: 'default-sentinel' });
    LinkedStorage.setDefaultDataset(sentinel);

    const [first, second] = await Promise.all([
      upsertTranslationKey(
        { appId: APP, key: KEY, sourceText: 'Alpha' },
        {},
        { dataset: targetA },
      ),
      upsertTranslationKey(
        { appId: APP, key: KEY, sourceText: 'Beta' },
        {},
        { dataset: targetB },
      ),
    ]);

    expect(first.versionCreated).toBe(true);
    expect(second.versionCreated).toBe(true);
    expect((await keysIn(targetA))[0]?.sourceText).toBe('Alpha');
    expect((await keysIn(targetB))[0]?.sourceText).toBe('Beta');
    expect(await versionsIn(targetA)).toEqual([
      expect.objectContaining({ sourceText: 'Alpha' }),
    ]);
    expect(await versionsIn(targetB)).toEqual([
      expect.objectContaining({ sourceText: 'Beta' }),
    ]);
    expect(await keysIn(sentinel)).toEqual([]);
  });
});
