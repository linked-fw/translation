import { describe, expect, it, vi } from 'vitest';
import { createReleaseLoader } from '../src/cdn-loader.js';
import { canonicalJson, type TranslationBuildDescriptor } from '../src/release.js';
import { sha256Hex } from '../src/key-version.js';

async function fixture() {
  const base = canonicalJson({ hello: 'Hola', remove: 'old' });
  const patch = canonicalJson({ set: { hello: 'Buenas' }, remove: ['remove'] });
  const baseHash = await sha256Hex(base);
  const patchHash = await sha256Hex(patch);
  const descriptor: TranslationBuildDescriptor = {
    schemaVersion: 2,
    appId: 'app',
    releaseId: 'release-1',
    contractSetHash: 'contracts-1',
    manifestUrl: 'https://cdn.test/releases/release-1/manifest.json',
  };
  const manifest = canonicalJson({
    schemaVersion: 2,
    releaseId: descriptor.releaseId,
    contractSetHash: descriptor.contractSetHash,
    hotfixSequence: 1,
    keyVersions: { hello: 'version-hello' },
    quality: {},
    languages: {
      es: {
        base: { hash: baseHash, url: `https://cdn.test/objects/catalog/${baseHash}.json`, bytes: base.length },
        patches: [
          { hash: patchHash, url: `https://cdn.test/objects/patch/${patchHash}.json`, bytes: patch.length, sequence: 1 },
        ],
      },
    },
  });
  return { base, patch, descriptor, manifest };
}

describe('createReleaseLoader', () => {
  it('renders bundled first and applies compatible background objects next load', async () => {
    const { base, patch, descriptor, manifest } = await fixture();
    const bodies = new Map([
      ['/translations/es.json', canonicalJson({ hello: 'Bundled' })],
      [descriptor.manifestUrl, manifest],
      [JSON.parse(manifest).languages.es.base.url, base],
      [JSON.parse(manifest).languages.es.patches[0].url, patch],
    ]);
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const body = bodies.get(String(input));
      return new Response(body ?? '', { status: body === undefined ? 404 : 200 });
    }) as typeof fetch;
    const load = createReleaseLoader({
      bundledPath: '/translations',
      descriptor,
      fetchImpl,
    });

    expect(await load('es')).toEqual({ hello: 'Bundled' });
    expect(await load('es')).toEqual({ hello: 'Buenas' });
  });

  it('retains bundled messages when the manifest contract is incompatible', async () => {
    const { descriptor, manifest } = await fixture();
    const incompatible = manifest.replace('contracts-1', 'contracts-other');
    const fetchImpl = vi.fn(async (input: string | URL | Request) =>
      new Response(
        String(input) === '/translations/es.json'
          ? canonicalJson({ hello: 'Bundled' })
          : incompatible,
      ),
    ) as typeof fetch;
    const load = createReleaseLoader({
      bundledPath: '/translations',
      descriptor,
      fetchImpl,
    });

    expect(await load('es')).toEqual({ hello: 'Bundled' });
    expect(await load('es')).toEqual({ hello: 'Bundled' });
  });

  it('may block once on the CDN for a language absent from the bundle', async () => {
    const { base, descriptor, manifest } = await fixture();
    const parsed = JSON.parse(manifest);
    parsed.languages.es.patches = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/translations/es.json') return new Response('', { status: 404 });
      if (url === descriptor.manifestUrl) return new Response(canonicalJson(parsed));
      return new Response(base);
    }) as typeof fetch;
    const load = createReleaseLoader({
      bundledPath: '/translations',
      descriptor,
      fetchImpl,
    });

    expect(await load('es')).toEqual({ hello: 'Hola', remove: 'old' });
  });
});
