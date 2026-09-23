import { describe, expect, it, vi } from 'vitest';
import { createCdnLoader } from '../src/cdn-loader.js';

function fetchStub(files: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const hit = Object.keys(files).find((u) => url === u);
    return hit
      ? { ok: true, json: async () => files[hit] }
      : { ok: false, json: async () => ({}) };
  }) as unknown as typeof fetch;
}

describe('createCdnLoader', () => {
  it('fetches {base}/{lang}.json (simple-pointer default)', async () => {
    const load = createCdnLoader({
      base: 'https://lang.serve.community/serve-earth/serve_community/',
      fetchImpl: fetchStub({
        'https://lang.serve.community/serve-earth/serve_community/es.json': { 'a': 'Hola' },
      }),
    });
    expect(await load('es')).toEqual({ a: 'Hola' });
  });

  it('falls back CDN → bundled → devApi, first non-empty wins', async () => {
    const devApi = vi.fn(async () => ({ a: 'from-rpc' }));
    const load = createCdnLoader({
      base: 'https://cdn/app',
      bundledPath: '/public/translations',
      devApi,
      fetchImpl: fetchStub({
        '/public/translations/fr.json': { a: 'from-bundle' },
        // no CDN fr.json → 404
      }),
    });
    // CDN misses (404) → bundled hits
    expect(await load('fr')).toEqual({ a: 'from-bundle' });
    expect(devApi).not.toHaveBeenCalled();
  });

  it('uses devApi when CDN + bundled both miss', async () => {
    const load = createCdnLoader({
      base: 'https://cdn/app',
      bundledPath: '/public/translations',
      devApi: async () => ({ a: 'from-rpc' }),
      fetchImpl: fetchStub({}), // everything 404s
    });
    expect(await load('de')).toEqual({ a: 'from-rpc' });
  });

  it('dev config (devApi only) skips the network entirely', async () => {
    const fetchImpl = fetchStub({});
    const load = createCdnLoader({ devApi: async () => ({ a: 'live' }), fetchImpl });
    expect(await load('es')).toEqual({ a: 'live' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns {} when every source is empty/missing (client keeps inline defaults)', async () => {
    const load = createCdnLoader({
      base: 'https://cdn/app',
      fetchImpl: fetchStub({ 'https://cdn/app/es.json': {} }), // present but empty → skip
    });
    expect(await load('es')).toEqual({});
  });

  it('never throws when a source rejects', async () => {
    const load = createCdnLoader({
      base: 'https://cdn/app',
      devApi: async () => {
        throw new Error('rpc down');
      },
      fetchImpl: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    });
    expect(await load('es')).toEqual({});
  });
});
