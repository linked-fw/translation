import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { defineLanguage, languageFallbacks, localeDirection, validateLanguageDefinitions } from '../src/languages.js';
import { compileLanguage, compileCatalogs } from '../src/compile.js';
import { createCdnLanguageLoader } from '../src/cdn-loader.js';
import { TranslationProvider, useLanguage, useTranslate } from '../src/react.js';

describe('open language resources', () => {
  it('accepts new regional languages and derives RTL from scripts', () => {
    expect(defineLanguage('es-mx').code).toBe('es-MX');
    expect(defineLanguage('yo').nativeName).not.toBe('');
    expect(localeDirection('ar-EG')).toBe('rtl');
    expect(localeDirection('he')).toBe('rtl');
    expect(localeDirection('az-Arab')).toBe('rtl');
    expect(localeDirection('az-Latn')).toBe('ltr');
  });

  it('applies configured regional fallback before English and rejects cycles', () => {
    const definitions = [defineLanguage('en'), defineLanguage('pt', { fallback: 'en' }), defineLanguage('pt-BR', { fallback: 'pt' })];
    validateLanguageDefinitions(definitions);
    expect(languageFallbacks('pt-BR', 'en', definitions)).toEqual(['pt-BR', 'pt', 'en']);
    const entries = [{ key: 'hello', kind: 'ui', sourceText: 'Hello', format: 'simple', units: { pt: { text: 'Olá', state: 'reviewed' }, 'pt-BR': { text: 'Oi', state: 'machine' } } }] as any;
    expect(compileLanguage(entries, 'pt-BR', { defaultLanguage: 'en', reviewedOnly: true, languageResources: definitions }).hello).toBe('Olá');
    expect(compileCatalogs(entries, { defaultLanguage: 'en', languages: ['ar-EG'], languageResources: [defineLanguage('ar-EG')] }).manifest.languages['ar-EG'].dir).toBe('rtl');
    expect(() => validateLanguageDefinitions([defineLanguage('en', { fallback: 'pt' }), defineLanguage('pt', { fallback: 'en' })])).toThrow(/Cyclic/);
  });

  it('loads additional language metadata from the configured CDN', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ schemaVersion: 1, languages: [defineLanguage('en'), defineLanguage('yo', { fallback: 'en' })] }))) as any;
    const languages = await createCdnLanguageLoader({ base: 'https://lang.example.test/app/', fetchImpl })();
    expect(languages.map((item) => item.code)).toEqual(['en', 'yo']);
    expect(fetchImpl).toHaveBeenCalledWith('https://lang.example.test/app/languages.json');
  });

  it('adds a language at runtime, renders its messages and switches the document to RTL', async () => {
    const Demo = () => {
      const { languages, setLanguage } = useLanguage();
      const { t } = useTranslate();
      return <><select aria-label="Language" onChange={(event) => setLanguage(event.target.value)}>{languages.map((language) => <option key={language.tag} value={language.tag}>{language.label}</option>)}</select><p>{t('hello', 'Hello')}</p></>;
    };
    render(<TranslationProvider languages={[{ tag: 'en', label: 'English' }]} loadLanguages={async () => [defineLanguage('en'), defineLanguage('ar-EG', { parent: undefined, fallback: 'en' })]} loadMessages={async (language) => language === 'ar-EG' ? { hello: 'مرحبا' } : { hello: 'Hello' }}><Demo /></TranslationProvider>);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ar-EG' } });
    expect(await screen.findByText('مرحبا')).toBeTruthy();
    expect(document.documentElement.lang).toBe('ar-EG');
    expect(document.documentElement.dir).toBe('rtl');
  });
});
