/**
 * Shape keys across apps: what the operations read, and which key writes they make. The writes
 * themselves are `upsertTranslationKey` (versioning and unit staling are its own, tested in
 * translation-version-writes); here it is a spy, and the reads answer fixed rows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
let keyUpdate: ReturnType<typeof vi.fn>;
let keyUpdateFor: ReturnType<typeof vi.fn>;

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
  keyWhere = vi.fn(() => Promise.resolve(keyRows));
  vi.spyOn(TranslationKey, 'select').mockReturnValue({ where: keyWhere } as any);
  vi.spyOn(TranslationUnit, 'select').mockReturnValue({ where: () => Promise.resolve(unitRows) } as any);
  keyUpdateFor = vi.fn().mockResolvedValue({});
  keyUpdate = vi.spyOn(TranslationKey, 'update').mockReturnValue({ for: keyUpdateFor } as any) as any;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(upsertTranslationKey).mockClear();
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
