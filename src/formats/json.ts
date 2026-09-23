import { unzipSync, zipSync, type Zippable } from 'fflate';

import {
  normalizeParsedTranslationExchangeDocument,
  validateTranslationExchangeDocument,
  type ParsedTranslationExchangeDocument,
  type SerializedTranslationDocument,
  type TranslationExchangeDocument,
  type TranslationExchangeEntry,
  type TranslationFormatAdapter,
} from '../exchange.js';
import { canonicalLanguageTag } from '../key-version.js';

const textDecoder = new TextDecoder('utf-8', { fatal: true });
const textEncoder = new TextEncoder();
const SIDECAR_PATH = 'create-now.exchange.json';
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_EMPTY_SIGNATURE = 0x06054b50;
const ZIP_SPANNED_SIGNATURE = 0x08074b50;

export type I18nextJsonLayout = 'flat' | 'nested';

export interface TranslationJsonArchiveLimits {
  maxEntries: number;
  maxArchiveBytes: number;
  maxEntryCompressedBytes: number;
  maxEntryUncompressedBytes: number;
  maxTotalUncompressedBytes: number;
  maxCompressionRatio: number;
}

export const DEFAULT_TRANSLATION_JSON_ARCHIVE_LIMITS:
  TranslationJsonArchiveLimits = Object.freeze({
    maxEntries: 256,
    maxArchiveBytes: 16 * 1024 * 1024,
    maxEntryCompressedBytes: 8 * 1024 * 1024,
    maxEntryUncompressedBytes: 16 * 1024 * 1024,
    maxTotalUncompressedBytes: 64 * 1024 * 1024,
    maxCompressionRatio: 100,
  });

export interface TranslationJsonParseOptions {
  /** Required when a standalone filename does not begin with a BCP-47 tag. */
  language?: string;
  /** Standalone JSON has no source evidence, so this defaults to `und`. */
  sourceLanguage?: string;
  /** Tolgee's default namespace is exposed as unprefixed runtime keys. */
  defaultNamespace?: string;
  fileName?: string;
  limits?: Partial<TranslationJsonArchiveLimits>;
}

export interface TranslationJsonSerializeOptions {
  layout?: I18nextJsonLayout;
  limits?: Partial<TranslationJsonArchiveLimits>;
}

interface CreateNowJsonSidecar {
  schemaVersion: 1;
  format: 'create-now-i18next-zip';
  exchange: TranslationExchangeDocument;
  files: Record<string, string>;
}

interface JsonObject {
  [key: string]: JsonValue;
}
type JsonValue = string | JsonObject;

function decodeUtf8(input: Uint8Array, label: string): string {
  try {
    return textDecoder.decode(input);
  } catch {
    throw new Error(`${label} is not valid UTF-8.`);
  }
}

function parseJsonObject(input: Uint8Array, label: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(decodeUtf8(input, label));
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('is not valid UTF-8.')) {
      throw error;
    }
    throw new Error(`${label} is not valid JSON.`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must contain a JSON object.`);
  }
  return value as JsonObject;
}

function flattenJsonObject(
  input: JsonObject,
  prefix = '',
  output: Record<string, string> = Object.create(null),
): Record<string, string> {
  for (const key of Object.keys(input).sort()) {
    if (!key) throw new Error('i18next JSON keys must not be empty.');
    const value = input[key] as unknown;
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      if (Object.hasOwn(output, path)) {
        throw new Error(`Duplicate i18next key "${path}".`);
      }
      output[path] = value;
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(
        `i18next JSON value for "${path}" must be a string or object.`,
      );
    }
    flattenJsonObject(value as JsonObject, path, output);
  }
  return output;
}

function nestedJsonObject(values: Record<string, string>): JsonObject {
  const root: JsonObject = Object.create(null);
  for (const key of Object.keys(values).sort()) {
    const segments = key.split('.');
    if (segments.some((segment) => !segment)) {
      throw new Error(`Cannot nest i18next key "${key}" with an empty segment.`);
    }
    let cursor = root;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const path = segments.slice(0, index + 1).join('.');
      const last = index === segments.length - 1;
      const existing = cursor[segment];
      if (last) {
        if (existing !== undefined) {
          throw new Error(
            `Cannot nest i18next keys because "${path}" is both a value and a namespace.`,
          );
        }
        cursor[segment] = values[key];
      } else {
        if (typeof existing === 'string') {
          throw new Error(
            `Cannot nest i18next keys because "${path}" is both a value and a namespace.`,
          );
        }
        if (!existing) cursor[segment] = Object.create(null) as JsonObject;
        cursor = cursor[segment] as JsonObject;
      }
    }
  }
  return root;
}

function orderedFlatJsonObject(values: Record<string, string>): JsonObject {
  const output: JsonObject = Object.create(null);
  for (const key of Object.keys(values).sort()) output[key] = values[key];
  return output;
}

function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(item as Record<string, unknown>).sort()) {
        result[key] = normalize((item as Record<string, unknown>)[key]);
      }
      return result;
    }
    return item;
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

function storageKey(entry: Pick<TranslationExchangeEntry, 'key' | 'namespace'>):
  string {
  return entry.namespace ? `${entry.namespace}:${entry.key}` : entry.key;
}

function languageValues(
  document: TranslationExchangeDocument,
  language: string,
): Record<string, string> {
  const values: Record<string, string> = Object.create(null);
  for (const entry of document.entries) {
    const key = storageKey(entry);
    if (Object.hasOwn(values, key)) {
      throw new Error(
        `i18next JSON key "${key}" is ambiguous after namespace mapping.`,
      );
    }
    if (language === document.sourceLanguage) {
      values[key] = entry.sourceText;
    } else {
      const translation = entry.translations[language];
      if (translation) values[key] = translation.text;
    }
  }
  return values;
}

function serializeLanguage(
  document: TranslationExchangeDocument,
  language: string,
  layout: I18nextJsonLayout,
): Uint8Array {
  const values = languageValues(document, language);
  const json =
    layout === 'nested'
      ? nestedJsonObject(values)
      : orderedFlatJsonObject(values);
  return textEncoder.encode(stableJson(json));
}

function isZip(input: Uint8Array): boolean {
  if (input.byteLength < 4) return false;
  const signature = new DataView(
    input.buffer,
    input.byteOffset,
    input.byteLength,
  ).getUint32(0, true);
  return (
    signature === ZIP_LOCAL_FILE_SIGNATURE ||
    signature === ZIP_EMPTY_SIGNATURE ||
    signature === ZIP_SPANNED_SIGNATURE
  );
}

export function translationZipLimits(
  overrides?: Partial<TranslationJsonArchiveLimits>,
): TranslationJsonArchiveLimits {
  const limits = {
    ...DEFAULT_TRANSLATION_JSON_ARCHIVE_LIMITS,
    ...overrides,
  };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`ZIP limit "${name}" must be a positive number.`);
    }
  }
  return limits;
}

function assertSafeArchivePath(path: string): void {
  if (
    !path ||
    path.includes('\0') ||
    path.startsWith('/') ||
    path.startsWith('\\') ||
    /^[A-Za-z]:/.test(path)
  ) {
    throw new Error(`Unsafe ZIP entry path "${path}".`);
  }
  const segments = path.replaceAll('\\', '/').split('/');
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error(`Unsafe ZIP entry path "${path}".`);
  }
}

export function safeUnzipTranslationZip(
  input: Uint8Array,
  overrides?: Partial<TranslationJsonArchiveLimits>,
): Record<string, Uint8Array> {
  const limits = translationZipLimits(overrides);
  if (input.byteLength > limits.maxArchiveBytes) {
    throw new Error('ZIP archive exceeds the compressed size limit.');
  }
  const names = new Set<string>();
  let entryCount = 0;
  let totalUncompressed = 0;
  try {
    // fflate calls the filter before inflating each entry. A validation-only
    // pass that rejects every entry therefore inspects the complete central
    // directory before a second pass allocates or decompresses file bodies.
    unzipSync(input, {
      filter: (entry) => {
        assertSafeArchivePath(entry.name);
        if (names.has(entry.name)) {
          throw new Error(`ZIP archive contains duplicate entry "${entry.name}".`);
        }
        names.add(entry.name);
        entryCount += 1;
        if (entryCount > limits.maxEntries) {
          throw new Error('ZIP archive exceeds the entry-count limit.');
        }
        if (entry.size > limits.maxEntryCompressedBytes) {
          throw new Error(
            `ZIP entry "${entry.name}" exceeds the compressed size limit.`,
          );
        }
        if (entry.originalSize > limits.maxEntryUncompressedBytes) {
          throw new Error(
            `ZIP entry "${entry.name}" exceeds the uncompressed size limit.`,
          );
        }
        totalUncompressed += entry.originalSize;
        if (totalUncompressed > limits.maxTotalUncompressedBytes) {
          throw new Error('ZIP archive exceeds the total uncompressed size limit.');
        }
        const ratio = entry.originalSize / Math.max(1, entry.size);
        if (ratio > limits.maxCompressionRatio) {
          throw new Error(
            `ZIP entry "${entry.name}" exceeds the compression-ratio limit.`,
          );
        }
        return false;
      },
    });
    return unzipSync(input, {
      filter: (entry) => !entry.name.endsWith('/'),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('ZIP ')) throw error;
    throw new Error(
      `Invalid or unsupported ZIP archive: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function languageFromFileName(fileName?: string): string | undefined {
  if (!fileName) return undefined;
  const name = fileName.replaceAll('\\', '/').split('/').pop() ?? '';
  const candidate = name.replace(/\.json$/i, '');
  try {
    return canonicalLanguageTag(candidate);
  } catch {
    return undefined;
  }
}

function parseStandalone(
  input: Uint8Array,
  options: TranslationJsonParseOptions,
): ParsedTranslationExchangeDocument {
  const language = canonicalLanguageTag(
    options.language ?? languageFromFileName(options.fileName) ?? 'und',
  );
  const sourceLanguage = canonicalLanguageTag(options.sourceLanguage ?? 'und');
  const values = flattenJsonObject(
    parseJsonObject(input, options.fileName ?? 'Standalone i18next JSON'),
  );
  return normalizeParsedTranslationExchangeDocument({
    schemaVersion: 1,
    sourceLanguage,
    targetLanguages: [language],
    entries: Object.keys(values)
      .sort()
      .map((key) => ({
        key,
        kind: 'ui',
        format: 'simple',
        translations: { [language]: { text: values[key] } },
      })),
  });
}

function sidecarFromBytes(input: Uint8Array): CreateNowJsonSidecar {
  const value = parseJsonObject(input, SIDECAR_PATH) as unknown as Partial<
    CreateNowJsonSidecar
  >;
  if (
    value.schemaVersion !== 1 ||
    value.format !== 'create-now-i18next-zip' ||
    !value.exchange ||
    !value.files ||
    typeof value.files !== 'object' ||
    Array.isArray(value.files)
  ) {
    throw new Error('Create Now JSON ZIP sidecar is invalid.');
  }
  return value as CreateNowJsonSidecar;
}

function assertMapsEqual(
  actual: Record<string, string>,
  expected: Record<string, string>,
  label: string,
): void {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${label} keys do not match the Create Now sidecar.`);
  }
  for (const key of expectedKeys) {
    if (actual[key] !== expected[key]) {
      throw new Error(
        `${label} value for "${key}" does not match the Create Now sidecar.`,
      );
    }
  }
}

function parseArchive(
  input: Uint8Array,
  options: TranslationJsonParseOptions,
): ParsedTranslationExchangeDocument {
  const files = safeUnzipTranslationZip(input, options.limits);
  const sidecarBytes = files[SIDECAR_PATH];
  if (!sidecarBytes) {
    return parseTolgeeArchive(files, options);
  }
  const sidecar = sidecarFromBytes(sidecarBytes);
  const exchange = validateTranslationExchangeDocument(sidecar.exchange);
  const expectedLanguages = [
    exchange.sourceLanguage,
    ...exchange.targetLanguages,
  ];
  const fileLanguages = Object.keys(sidecar.files).sort();
  if (
    fileLanguages.length !== expectedLanguages.length ||
    expectedLanguages
      .slice()
      .sort()
      .some((language, index) => language !== fileLanguages[index])
  ) {
    throw new Error('Create Now JSON ZIP language manifest is incomplete.');
  }
  const usedPaths = new Set<string>();
  for (const language of expectedLanguages) {
    const path = sidecar.files[language];
    if (typeof path !== 'string') {
      throw new Error(`Create Now JSON ZIP has no file for ${language}.`);
    }
    assertSafeArchivePath(path);
    if (usedPaths.has(path)) {
      throw new Error(`Create Now JSON ZIP reuses language file "${path}".`);
    }
    usedPaths.add(path);
    const bytes = files[path];
    if (!bytes) {
      throw new Error(`Create Now JSON ZIP is missing language file "${path}".`);
    }
    const actual = flattenJsonObject(parseJsonObject(bytes, path));
    const expected = languageValues(exchange, language);
    assertMapsEqual(actual, expected, path);
  }
  return normalizeParsedTranslationExchangeDocument(exchange);
}

/** Tolgee JSON exports carry source text, but no immutable key-version evidence.
 * Parsing never writes or invents version IDs; a manager must approve the import.
 * The same bounded ZIP reader runs before either archive format is considered.
 */
function parseTolgeeArchive(
  files: Record<string, Uint8Array>,
  options: TranslationJsonParseOptions,
): ParsedTranslationExchangeDocument {
  const sourceLanguage = canonicalLanguageTag(options.sourceLanguage ?? 'en');
  const defaultNamespace = options.defaultNamespace ?? 'common';
  const namespaces = new Map<string, Map<string, Record<string, string>>>();
  for (const [path, bytes] of Object.entries(files)) {
    const match = /^(?:([^/\\]+)\/)?([^/\\]+)\.json$/.exec(path);
    if (!match) {
      throw new Error(`Tolgee ZIP entry "${path}" must use namespace/language.json or language.json.`);
    }
    const [, namespace = '', languageName] = match;
    const language = canonicalLanguageTag(languageName);
    if (language === 'und') throw new Error(`Tolgee ZIP entry "${path}" needs a language tag.`);
    let languages = namespaces.get(namespace);
    if (!languages) namespaces.set(namespace, (languages = new Map()));
    if (languages.has(language)) {
      throw new Error(`Tolgee ZIP contains duplicate language ${language} in ${namespace}.`);
    }
    languages.set(language, flattenJsonObject(parseJsonObject(bytes, path)));
  }
  if (!namespaces.size) throw new Error('Tolgee ZIP contains no language files.');
  const targetLanguages = new Set<string>();
  const entries: ParsedTranslationExchangeDocument['entries'] = [];
  for (const [namespace, languages] of namespaces) {
    const sources = languages.get(sourceLanguage);
    if (!sources) {
      throw new Error(`Tolgee ZIP is missing ${namespace}/${sourceLanguage}.json source text.`);
    }
    for (const [language, values] of languages) {
      if (language === sourceLanguage) continue;
      targetLanguages.add(language);
      for (const key of Object.keys(values)) {
        if (!Object.hasOwn(sources, key)) {
          throw new Error(`Tolgee key "${namespace}:${key}" in ${language} has no source text.`);
        }
      }
    }
    for (const key of Object.keys(sources).sort()) {
      const translations: TranslationExchangeEntry['translations'] = Object.create(null);
      for (const [language, values] of languages) {
        if (language !== sourceLanguage && Object.hasOwn(values, key) && values[key] !== '') {
          translations[language] = { text: values[key] };
        }
      }
      entries.push({
        key,
        ...(!namespace || namespace === defaultNamespace ? {} : { namespace }),
        kind: 'ui',
        format: 'simple',
        sourceText: sources[key],
        translations,
      });
    }
  }
  return normalizeParsedTranslationExchangeDocument({
    schemaVersion: 1,
    sourceLanguage,
    targetLanguages: [...targetLanguages].sort(),
    entries,
  });
}

export function parseI18nextJson(
  input: Uint8Array,
  options: TranslationJsonParseOptions = {},
): ParsedTranslationExchangeDocument {
  return isZip(input)
    ? parseArchive(input, options)
    : parseStandalone(input, options);
}

export function serializeI18nextJsonZip(
  document: TranslationExchangeDocument,
  options: TranslationJsonSerializeOptions = {},
): SerializedTranslationDocument {
  const exchange = validateTranslationExchangeDocument(document);
  const limits = translationZipLimits(options.limits);
  const layout = options.layout ?? 'flat';
  const files: Zippable = Object.create(null);
  const languageFiles: Record<string, string> = Object.create(null);
  const languages = [exchange.sourceLanguage, ...exchange.targetLanguages];
  for (const language of languages) {
    const path = `locales/${language}.json`;
    languageFiles[language] = path;
    files[path] = serializeLanguage(exchange, language, layout);
  }
  const sidecar: CreateNowJsonSidecar = {
    schemaVersion: 1,
    format: 'create-now-i18next-zip',
    exchange,
    files: languageFiles,
  };
  files[SIDECAR_PATH] = textEncoder.encode(stableJson(sidecar));
  if (Object.keys(files).length > limits.maxEntries) {
    throw new Error('ZIP archive exceeds the entry-count limit.');
  }
  for (const [path, body] of Object.entries(files)) {
    const bytes = Array.isArray(body) ? body[0] : body;
    if (bytes instanceof Uint8Array && bytes.byteLength > limits.maxEntryUncompressedBytes) {
      throw new Error(`ZIP entry "${path}" exceeds the uncompressed size limit.`);
    }
  }
  const body = zipSync(files, {
    level: 6,
    mtime: new Date('1980-01-01T00:00:00.000Z'),
  });
  if (body.byteLength > limits.maxArchiveBytes) {
    throw new Error('ZIP archive exceeds the compressed size limit.');
  }
  // Guarantee that an archive produced with custom limits is accepted by the
  // same guarded import path (including total-size and ratio checks).
  safeUnzipTranslationZip(body, limits);
  return {
    fileName: 'translations.i18next.zip',
    mediaType: 'application/zip',
    body,
  };
}

export const i18nextJsonFormatAdapter: TranslationFormatAdapter = {
  format: 'json',
  sniff(input, fileName) {
    if (isZip(input)) return true;
    if (fileName?.toLowerCase().endsWith('.json')) return true;
    const first = decodeUtf8(input.slice(0, 64), 'JSON input').trimStart()[0];
    return first === '{';
  },
  async parse(input, options) {
    return parseI18nextJson(input, options as TranslationJsonParseOptions);
  },
  async serialize(document, options) {
    return serializeI18nextJsonZip(
      document,
      options as TranslationJsonSerializeOptions,
    );
  },
};
