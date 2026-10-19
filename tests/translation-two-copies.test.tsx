import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * A module can be evaluated twice in one runtime (Vite's SSR runner and Node under
 * `linked start`, or two browser bundles). These tests load each BUILT module twice — the
 * second time under a `?copy` query, which makes it a separate module instance with its own
 * module scope — and show that what one copy is given, the other sees.
 */
type Authorization = typeof import('../lib/esm/authorization.js');
type Mt = typeof import('../lib/esm/mt.js');
type Exchange = typeof import('../lib/esm/exchange.js');
type ReactModule = typeof import('../lib/esm/react.js');

async function twoCopies<T>(path: string): Promise<[T, T]> {
  const first = (await import(/* @vite-ignore */ path)) as T;
  const second = (await import(/* @vite-ignore */ `${path}?copy`)) as T;
  return [first, second];
}

const lib = (name: string) => `../lib/esm/${name}`;

describe('a second copy of @_linked/translation shares its state', () => {
  afterEach(async () => {
    const [a] = await twoCopies<Authorization>(lib('authorization.js'));
    a.configureTranslationAuthorization(undefined);
    const [mt] = await twoCopies<Mt>(lib('mt.js'));
    mt.clearMtProviders();
    const [ex] = await twoCopies<Exchange>(lib('exchange.js'));
    ex.clearTranslationFormatAdapters();
  });

  it('the authorization resolver configured on one copy answers on the other', async () => {
    const [a, b] = await twoCopies<Authorization>(lib('authorization.js'));
    expect(b.canAuthorTranslation).not.toBe(a.canAuthorTranslation);
    const request = { appId: 'app', actorWebId: 'https://x/#me', action: 'manage' as const };
    expect(await b.canAuthorTranslation(request)).toBe(false);
    a.configureTranslationAuthorization(async () => true);
    expect(await b.canAuthorTranslation(request)).toBe(true);
    b.configureTranslationAuthorization(undefined);
    expect(await a.canAuthorTranslation(request)).toBe(false);
  });

  it('an MT provider registered on one copy is found by the other', async () => {
    const [a, b] = await twoCopies<Mt>(lib('mt.js'));
    expect(b.registerMtProvider).not.toBe(a.registerMtProvider);
    const provider = { key: 'two-copies', translateBatch: async () => [] };
    a.registerMtProvider(provider);
    expect(b.getMtProvider('two-copies')).toBe(provider);
    expect(b.resolveMtProviders('nl')).toEqual([provider]);
    b.clearMtProviders();
    expect(a.listMtProviders()).toEqual([]);
  });

  it('a format adapter registered on one copy is found by the other; the same adapter again is not a duplicate', async () => {
    const [a, b] = await twoCopies<Exchange>(lib('exchange.js'));
    expect(b.registerTranslationFormatAdapter).not.toBe(a.registerTranslationFormatAdapter);
    const adapter = {
      format: 'csv' as const,
      sniff: () => true,
      parse: async () => {
        throw new Error('unused');
      },
      serialize: async () => ({
        fileName: 'x.csv',
        mediaType: 'text/csv',
        body: new Uint8Array(),
      }),
    };
    a.registerTranslationFormatAdapter(adapter);
    expect(b.getTranslationFormatAdapter('csv')).toBe(adapter);
    expect(() => b.registerTranslationFormatAdapter(adapter)).not.toThrow();
    expect(b.listTranslationFormatAdapters()).toEqual([adapter]);
    expect(() => b.registerTranslationFormatAdapter({ ...adapter })).toThrow(
      'already registered',
    );
  });

  it('a TranslationProvider from one copy is seen by useTranslate from the other', async () => {
    const [a, b] = await twoCopies<ReactModule>(lib('react.js'));
    expect(b.TranslationProvider).not.toBe(a.TranslationProvider);
    function Consumer() {
      const { t } = b.useTranslate();
      return <span data-testid="msg">{t('hello', 'Hello')}</span>;
    }
    render(
      <a.TranslationProvider
        languages={[{ tag: 'es', label: 'Español' }]}
        defaultLanguage="es"
        loadMessages={async () => ({ hello: 'Hola' })}
      >
        <Consumer />
      </a.TranslationProvider>,
    );
    expect(await screen.findByText('Hola')).toBeTruthy();
  });
});
