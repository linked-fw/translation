import { describe, expect, it } from 'vitest';
import { toRevisionRecords } from '../src/shapes/TranslationProvider.js';

const APP = 'https://create.now/data/workspace/w/app/a';
const REV = (n: string) => `${APP}/translation/key/nav.home/unit/es/rev/${n}`;

describe('toRevisionRecords', () => {
  it('maps LINKED rows to plain records, newest first', () => {
    const rows = [
      {
        id: REV('older'),
        ofKey: { key: 'nav.home' },
        language: 'es',
        text: 'Inicio',
        status: 'applied',
        author: { id: 'https://webid.email/carlen' },
        authorKind: 'human',
        createdAt: '2026-07-01T10:00:00.000Z',
      },
      {
        id: REV('newer'),
        ofKey: { key: 'nav.home' },
        language: 'es',
        text: 'Página de inicio',
        status: 'applied',
        author: { id: 'https://webid.email/carlen' },
        authorKind: 'human',
        basedOnText: 'Inicio',
        createdAt: '2026-07-02T10:00:00.000Z',
        ofKeyVersion: { id: `${APP}/translation/key/nav.home/version/01NEW` },
      },
    ];
    const records = toRevisionRecords(rows as any);
    expect(records.map((r) => r.text)).toEqual(['Página de inicio', 'Inicio']);
    expect(records[0]).toMatchObject({
      id: REV('newer'),
      key: 'nav.home',
      language: 'es',
      status: 'applied',
      author: 'https://webid.email/carlen',
      authorKind: 'human',
      basedOnText: 'Inicio',
      keyVersionId: `${APP}/translation/key/nav.home/version/01NEW`,
    });
  });

  it('normalizes unknown statuses/authorKinds and drops textless rows', () => {
    const records = toRevisionRecords([
      {
        id: REV('a'),
        language: 'es',
        text: 'Hola',
        status: 'nonsense',
        authorKind: 'robot',
        createdAt: '2026-07-01T10:00:00.000Z',
      },
      { id: REV('broken'), language: 'es', status: 'applied' },
    ] as any);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('applied');
    expect(records[0].authorKind).toBe('human');
  });

  it('keeps machine authorship (provider + kind) for MT suggestions', () => {
    const [record] = toRevisionRecords([
      {
        id: REV('mt'),
        ofKey: { key: 'nav.home' },
        language: 'es',
        text: 'Inicio',
        status: 'suggested',
        author: { id: 'https://id.linked.cm/translation/provider/claude' },
        authorKind: 'machine',
        mtProvider: 'claude',
        createdAt: '2026-07-01T10:00:00.000Z',
      },
    ] as any);
    expect(record.status).toBe('suggested');
    expect(record.authorKind).toBe('machine');
    expect(record.mtProvider).toBe('claude');
  });

  it('breaks createdAt ties deterministically by id', () => {
    const rows = ['b', 'a'].map((n) => ({
      id: REV(n),
      language: 'es',
      text: n,
      status: 'applied',
      createdAt: '2026-07-01T10:00:00.000Z',
    }));
    const records = toRevisionRecords(rows as any);
    expect(records.map((r) => r.id)).toEqual([REV('b'), REV('a')]);
  });
});
