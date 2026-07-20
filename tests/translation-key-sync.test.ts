import { describe, expect, it, vi } from 'vitest';
import { extractTranslationKeys, syncTranslationKeys } from '@_linked/translation/key-sync';

describe('translation key sync', () => {
  it('extracts static hook and JSX defaults with source locations', () => {
    const keys = extractTranslationKeys(`
      const a = t('account.title', 'Account');
      const b = t(dynamicKey, 'Ignored');
      const c = <T keyName="nav.home" defaultValue={'Home'} />;
    `, 'sample.tsx');
    expect(keys).toEqual([
      { key: 'account.title', sourceText: 'Account', file: 'sample.tsx', line: 2 },
      { key: 'nav.home', sourceText: 'Home', file: 'sample.tsx', line: 4 },
    ]);
  });

  it('creates and updates keys while reporting conflicts and orphans', async () => {
    const target = {
      list: vi.fn().mockResolvedValue([
        { key: 'changed', sourceText: 'Old' },
        { key: 'same', sourceText: 'Same' },
        { key: 'orphan', sourceText: 'Unused' },
      ]),
      upsert: vi.fn().mockResolvedValue(undefined),
    };
    const item = (key: string, sourceText: string) => ({ key, sourceText, file: 'a.ts', line: 1 });
    const report = await syncTranslationKeys(target, 'app', [
      item('new', 'New'), item('changed', 'Changed'), item('same', 'Same'),
      item('conflict', 'One'), item('conflict', 'Two'),
    ]);
    expect(report).toEqual({
      created: ['new'], updated: ['changed'], unchanged: ['same'],
      orphaned: ['orphan'], conflicts: [{ key: 'conflict', defaults: ['One', 'Two'] }],
    });
    expect(target.upsert).toHaveBeenCalledTimes(2);
  });
});
