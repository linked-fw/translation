import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
