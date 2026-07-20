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

describe('TranslationProvider / useTranslate', () => {
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
});
