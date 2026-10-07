import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode, Suspense } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import {
  TranslationProvider,
  useLanguage,
  useTranslate,
} from '@_linked/translation/react';

// React binding for the translation core (Plan 014 P1.5). Proves the
// Tolgee-compatible useTranslate + the inline-default → loaded-overlay flow.

function Demo() {
  const { t } = useTranslate();
  const { language, dir } = useLanguage();
  return (
    <div>
      <span data-testid="msg">{t('hello', 'Hello, {name}', { name: 'Ana' })}</span>
      <span data-testid="lang">{language}</span>
      <span data-testid="dir">{dir}</span>
    </div>
  );
}

function IcuDemo() {
  const { t } = useTranslate();
  return (
    <span data-testid="icu">
      {t(
        'missing.count',
        '{n, plural, one {# mission} other {# missions}}',
        { n: 2 },
        { format: 'icu' },
      )}
    </span>
  );
}

describe('TranslationProvider / useTranslate', () => {
  it.each([false, true])(
    'loads messages without discarding a hydrating child (StrictMode=%s)',
    async (strict) => {
      let blocked = false;
      let unblock!: () => void;
      const pending = new Promise<void>((resolve) => {
        unblock = resolve;
      });
      function DeferredDemo() {
        if (blocked) throw pending;
        return <Demo />;
      }
      const content = (
        <TranslationProvider
          languages={[{ tag: 'es', label: 'Español' }]}
          defaultLanguage="es"
          loadMessages={async () => ({ hello: 'Hola, {name}' })}
        >
          <Suspense fallback={<div>Loading route</div>}>
            <DeferredDemo />
          </Suspense>
        </TranslationProvider>
      );
      const tree = strict ? <StrictMode>{content}</StrictMode> : content;
      const container = document.createElement('div');
      container.innerHTML = renderToString(tree);
      const original = container.querySelector('[data-testid="msg"]');
      document.body.append(container);
      const recoveries: unknown[] = [];
      let root: Root | undefined;
      try {
        blocked = true;
        await act(async () => {
          root = hydrateRoot(container, tree, {
            onRecoverableError: (error) => recoveries.push(error),
          });
        });
        await act(async () => {
          blocked = false;
          unblock();
          await pending;
        });
        const translated = await within(container).findByText('Hola, Ana');
        expect(recoveries.map((error) => String(error))).toEqual([]);
        expect(translated).toBe(original);
      } finally {
        await act(async () => root?.unmount());
        container.remove();
      }
    }
  );
  it('formats an explicit ICU inline default before messages load', () => {
    render(
      <TranslationProvider
        languages={[{ tag: 'en', label: 'English' }]}
        defaultLanguage="en"
        loadMessages={async () => ({})}
      >
        <IcuDemo />
      </TranslationProvider>,
    );
    expect(screen.getByTestId('icu').textContent).toBe('2 missions');
  });

  it('renders the inline default (interpolated) before messages load', () => {
    render(
      <TranslationProvider
        languages={[{ tag: 'en', label: 'English' }]}
        defaultLanguage="en"
        loadMessages={async () => ({})}
      >
        <Demo />
      </TranslationProvider>,
    );
    expect(screen.getByTestId('msg').textContent).toBe('Hello, Ana');
    expect(screen.getByTestId('lang').textContent).toBe('en');
    expect(screen.getByTestId('dir').textContent).toBe('ltr');
  });

  it('overlays loaded messages over the inline default', async () => {
    render(
      <TranslationProvider
        languages={[{ tag: 'es', label: 'Español' }]}
        defaultLanguage="es"
        loadMessages={async () => ({ hello: 'Hola, {name}' })}
      >
        <Demo />
      </TranslationProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('msg').textContent).toBe('Hola, Ana'),
    );
  });

  it('marks RTL languages on the document', async () => {
    render(
      <TranslationProvider
        languages={[{ tag: 'ar', label: 'العربية' }]}
        defaultLanguage="ar"
        loadMessages={async () => ({})}
      >
        <Demo />
      </TranslationProvider>,
    );
    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'));
  });

  it('observes preview locale and pseudo conditions without persisting a preference', async () => {
    const storageKey = 'preview-language-test';
    window.localStorage.removeItem(storageKey);
    render(
      <TranslationProvider
        languages={[
          { tag: 'en', label: 'English' },
          { tag: 'ar', label: 'العربية' },
        ]}
        defaultLanguage="en"
        loadMessages={async (language) =>
          language === 'ar' ? { hello: 'مرحبا، {name}' } : {}
        }
        storageKey={storageKey}
      >
        <Demo />
      </TranslationProvider>
    );

    window.dispatchEvent(
      new CustomEvent('create-now:preview-conditions', {
        detail: {
          conditions: [
            {
              adapterIri: 'https://create.now/shacl/PreviewLocaleAdapter',
              value: 'ar',
            },
            {
              adapterIri: 'https://create.now/shacl/PreviewPseudoLocaleAdapter',
              value: 'expanded',
            },
            {
              adapterIri: 'https://create.now/shacl/PreviewDirectionAdapter',
              value: 'ltr',
            },
          ],
        },
      })
    );

    await waitFor(() =>
      expect(screen.getByTestId('msg').textContent).toMatch(
        /^［مرحبا، Ana ·+］$/
      )
    );
    expect(screen.getByTestId('lang').textContent).toBe('ar');
    expect(screen.getByTestId('dir').textContent).toBe('ltr');
    expect(document.documentElement.dir).toBe('ltr');
    expect(window.localStorage.getItem(storageKey)).toBeNull();
  });
});
