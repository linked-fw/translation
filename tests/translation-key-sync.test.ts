import { describe, expect, it, vi } from 'vitest';
import { extractTranslationKeys, syncTranslationKeys } from '@_linked/translation/key-sync';
import {
  scanTranslationSourceTree,
  sourceTreeTranslationDiscoverySource,
  syncTranslationSourceTree,
} from '@_linked/translation/key-sync/node';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

  it('supports a dry run without writing changes', async () => {
    const upsert = vi.fn();
    const report = await syncTranslationKeys(
      { list: async () => [], upsert },
      'app',
      [{ key: 'home.title', sourceText: 'Home', file: 'home.tsx', line: 1 }],
      { dryRun: true },
    );

    expect(report.created).toEqual(['home.title']);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('scans source files deterministically and ignores generated output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'translation-key-sync-'));
    await mkdir(join(root, 'src', 'nested'), { recursive: true });
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(join(root, 'src', 'a.ts'), `t('a.key', 'A')`);
    await writeFile(join(root, 'src', 'nested', 'b.tsx'), `<T keyName="b.key" defaultValue="B" />`);
    await writeFile(join(root, 'src', 'ignored.css'), `t('css.key', 'CSS')`);
    await writeFile(join(root, 'dist', 'bundle.js'), `t('dist.key', 'Dist')`);

    const extracted = await scanTranslationSourceTree(root);

    expect(extracted.map(({ key, file }) => ({ key, file }))).toEqual([
      { key: 'a.key', file: 'src/a.ts' },
      { key: 'b.key', file: 'src/nested/b.tsx' },
    ]);

    const discovered = [];
    for await (const item of sourceTreeTranslationDiscoverySource(root).discover({
      appId: 'https://example.test/app',
      sourceRoot: root,
    })) {
      discovered.push(item);
    }
    expect(discovered.map(({ key, provenance }) => ({
      key,
      source: provenance.source,
      file: provenance.file,
    }))).toEqual([
      { key: 'a.key', source: 'code', file: 'src/a.ts' },
      { key: 'b.key', source: 'code', file: 'src/nested/b.tsx' },
    ]);
  });

  it('scans and applies through the supplied provider adapter', async () => {
    const root = await mkdtemp(join(tmpdir(), 'translation-key-sync-'));
    await writeFile(join(root, 'app.ts'), `t('app.title', 'Application')`);
    const upsert = vi.fn(async () => undefined);

    const report = await syncTranslationSourceTree({
      root,
      appId: 'https://example.test/app',
      target: { list: async () => [], upsert },
    });

    expect(report.created).toEqual(['app.title']);
    expect(upsert).toHaveBeenCalledWith({
      appId: 'https://example.test/app',
      key: 'app.title',
      sourceText: 'Application',
      kind: 'ui',
    });
  });
});
