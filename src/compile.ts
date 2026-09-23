import {
  languageFallbacks,
  type TranslationLanguageDefinition,
} from './languages.js';
/**
 * Compile app translations into publishable per-language payloads + a manifest
 * (Plan 016 P2.2, AD-K/AD-I). Pure and I/O-free: it takes the same
 * `TranslationEntryRecord[]` that `TranslationProvider.listEntries` already
 * produces and emits the `{lang}.json` maps + a content-hashed `manifest.json`.
 * The R2 publish route (P2.3) and the eject-honest CLI (R11) are thin wrappers
 * that read the entries, call this, and write the result.
 *
 * Only `kind:'ui'` keys are published; `kind:'content'` resolves query-time from
 * the app's own dataset (AD-I). Per-language publish policy (AD-K/R9): a
 * `reviewedOnly` language ships the reviewed value else falls back to the English
 * `sourceText` — never a machine/stale draft. Every payload is a COMPLETE
 * catalog (English fallback for anything missing), so it stands alone without the
 * app's inline defaults.
 */
import {
  directionFor,
  type TranslationMessage,
  type TranslationMessages,
} from './core/messages.js';
import type { TranslationEntryRecord } from './records.js';

export type TranslationPayload = TranslationMessages;

export interface TranslationManifestEntry {
  hash: string;
  dir: 'ltr' | 'rtl';
  count: number;
}

export interface TranslationManifest {
  schemaVersion: 1;
  defaultLanguage: string;
  generatedAt?: string;
  languageResources?: TranslationLanguageDefinition[];
  languages: Record<string, TranslationManifestEntry>;
}

export interface CompileOptions {
  languageResources?: TranslationLanguageDefinition[];
  languages: string[];
  defaultLanguage: string;
  /** BCP-47 tags published reviewed-only (absence ⇒ machine-ok). */
  reviewedOnlyLanguages?: Iterable<string>;
  /** Stamp the manifest; omit for deterministic output (tests). */
  generatedAt?: string;
}

/** Deterministic FNV-1a (32-bit) hex over a string — dep-free, browser-safe. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Canonical JSON with sorted keys, so the hash is stable across runs. */
export function stableStringify(payload: TranslationPayload): string {
  const keys = Object.keys(payload).sort();
  return JSON.stringify(Object.fromEntries(keys.map((k) => [k, payload[k]])));
}

/** Content hash of a payload (drives the `{lang}.{hash}.json` filename). */
export function hashPayload(payload: TranslationPayload): string {
  return hashString(stableStringify(payload));
}

/**
 * Compile one language's complete catalog from the app's UI entries, honoring
 * publish policy. The default/source language emits `sourceText` for every key.
 */
export function compileLanguage(
  entries: TranslationEntryRecord[],
  language: string,
  options: {
    defaultLanguage: string;
    reviewedOnly?: boolean;
    languageResources?: TranslationLanguageDefinition[];
  }
): TranslationPayload {
  const isSource = language === options.defaultLanguage;
  const payload: TranslationPayload = {};
  const valueFor = (
    entry: TranslationEntryRecord,
    message: string
  ): TranslationMessage =>
    entry.format === 'icu' ? { message, format: 'icu' } : message;
  for (const entry of entries) {
    if (entry.kind !== 'ui') continue; // AD-I: content is query-time, not published.
    const source = entry.sourceText ?? '';
    if (isSource) {
      payload[entry.key] = valueFor(entry, source);
      continue;
    }
    const candidates = languageFallbacks(
      language,
      options.defaultLanguage,
      options.languageResources
    );
    const unit = candidates
      .filter((code) => code !== options.defaultLanguage)
      .map((code) => entry.units?.[code])
      .find(
        (candidate) =>
          candidate?.text &&
          (!options.reviewedOnly || candidate.state === 'reviewed')
      );
    payload[entry.key] = valueFor(entry, unit?.text ?? source);
  }
  return payload;
}

/** Compile every requested language + a content-hashed manifest. */
export function compileCatalogs(
  entries: TranslationEntryRecord[],
  options: CompileOptions
): {
  payloads: Record<string, TranslationPayload>;
  manifest: TranslationManifest;
} {
  const reviewedOnly = new Set(options.reviewedOnlyLanguages ?? []);
  const payloads: Record<string, TranslationPayload> = {};
  const languages: Record<string, TranslationManifestEntry> = {};

  for (const language of options.languages) {
    const payload = compileLanguage(entries, language, {
      defaultLanguage: options.defaultLanguage,
      reviewedOnly: reviewedOnly.has(language),
      languageResources: options.languageResources,
    });
    payloads[language] = payload;
    languages[language] = {
      hash: hashPayload(payload),
      dir:
        options.languageResources?.find((item) => item.code === language)
          ?.direction ?? directionFor(language),
      count: Object.keys(payload).length,
    };
  }

  return {
    payloads,
    manifest: {
      schemaVersion: 1,
      defaultLanguage: options.defaultLanguage,
      ...(options.languageResources
        ? { languageResources: options.languageResources }
        : {}),
      ...(options.generatedAt ? { generatedAt: options.generatedAt } : {}),
      languages,
    },
  };
}

/** Filename for a compiled payload: `{lang}.json` (simple) or `{lang}.{hash}.json`. */
export function payloadFileName(
  language: string,
  hash: string,
  opts: { hashed?: boolean } = {}
): string {
  return opts.hashed ? `${language}.${hash}.json` : `${language}.json`;
}
