import type { MessageFormat } from './core/messages.js';
import { canonicalLanguageTag } from './key-version.js';
import type { TranslationState } from './records.js';

export type TranslationExchangeKind = 'ui' | 'semantic';
export type TranslationDeclarationKind =
  | TranslationExchangeKind
  | 'content';
export type TranslationDeclarationStatus = 'confirmed' | 'pending';

/**
 * The build-facing subset of the later multi-source discovery contract.
 * Static extraction omits the optional fields and retains its existing
 * confirmed/simple behavior.
 */
export interface TranslationBuildDeclaration {
  key: string;
  sourceText: string;
  format?: MessageFormat;
  kind?: TranslationDeclarationKind;
  status?: TranslationDeclarationStatus;
  authoritative?: boolean;
  namespace?: string;
  file?: string;
  line?: number;
}

export interface TranslationExchangeValue {
  text: string;
  state?: TranslationState;
  note?: string;
}

export interface TranslationExchangeEntry {
  key: string;
  namespace?: string;
  kind: TranslationExchangeKind;
  sourceText: string;
  keyVersionId: string;
  sourceHash: string;
  contractHash: string;
  argumentSignature: string;
  description?: string;
  format: MessageFormat;
  translations: Record<string, TranslationExchangeValue>;
}

export interface TranslationExchangeDocument {
  schemaVersion: 1;
  appId?: string;
  branchId?: string;
  sourceLanguage: string;
  targetLanguages: string[];
  exportedAt?: string;
  revisionWatermark?: string;
  contractSetHash?: string;
  entries: TranslationExchangeEntry[];
}

export type ParsedTranslationExchangeEntry = Omit<
  TranslationExchangeEntry,
  | 'sourceText'
  | 'keyVersionId'
  | 'sourceHash'
  | 'contractHash'
  | 'argumentSignature'
> & {
  sourceText?: string;
  keyVersionId?: string;
  sourceHash?: string;
  contractHash?: string;
  argumentSignature?: string;
};

export interface ParsedTranslationExchangeDocument
  extends Omit<TranslationExchangeDocument, 'entries'> {
  entries: ParsedTranslationExchangeEntry[];
}

export type TranslationFormat =
  | 'xliff-1.2'
  | 'xliff-2.0'
  | 'csv'
  | 'json';

export interface SerializedTranslationDocument {
  fileName: string;
  mediaType: string;
  body: Uint8Array;
}

export interface TranslationFormatAdapter {
  readonly format: TranslationFormat;
  sniff(input: Uint8Array, fileName?: string): boolean;
  parse(
    input: Uint8Array,
    options?: unknown,
  ): Promise<ParsedTranslationExchangeDocument>;
  serialize(
    document: TranslationExchangeDocument,
    options?: unknown,
  ): Promise<SerializedTranslationDocument>;
}

export type TranslationImportDisposition =
  | 'import'
  | 'carry-forward'
  | 'unverified-source'
  | 'conflict'
  | 'skip';

export interface TranslationImportDryRunEntry {
  key: string;
  language: string;
  disposition: TranslationImportDisposition;
  expectedKeyVersionId?: string;
  expectedUnitContentHash?: string;
}

export interface TranslationImportDryRun {
  sessionId: string;
  documentHash: string;
  revisionWatermark: string;
  expiresAt: string;
  entries: TranslationImportDryRunEntry[];
}

const EXCHANGE_STATES = new Set<TranslationState>([
  'untranslated',
  'machine',
  'reviewed',
  'stale',
]);
const adapters = new Map<TranslationFormat, TranslationFormatAdapter>();

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string when supplied.`);
  }
  return value.trim();
}

function messageFormat(value: unknown, label: string): MessageFormat {
  if (value !== 'simple' && value !== 'icu') {
    throw new Error(`${label} must be "simple" or "icu".`);
  }
  return value;
}

function exchangeKind(value: unknown, label: string): TranslationExchangeKind {
  if (value !== 'ui' && value !== 'semantic') {
    throw new Error(`${label} must be "ui" or "semantic".`);
  }
  return value;
}

function canonicalLanguages(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const canonical: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new Error(`${label} must contain only BCP-47 strings.`);
    }
    const language = canonicalLanguageTag(item);
    if (!seen.has(language)) {
      seen.add(language);
      canonical.push(language);
    }
  }
  return canonical;
}

function normalizeTranslations(
  value: unknown,
  label: string,
): Record<string, TranslationExchangeValue> {
  const input = record(value, label);
  const translations: Record<string, TranslationExchangeValue> = {};
  for (const [rawLanguage, rawValue] of Object.entries(input)) {
    const language = canonicalLanguageTag(rawLanguage);
    if (translations[language]) {
      throw new Error(
        `${label} contains duplicate canonical language "${language}".`,
      );
    }
    const item = record(rawValue, `${label}.${rawLanguage}`);
    if (typeof item.text !== 'string') {
      throw new Error(`${label}.${rawLanguage}.text must be a string.`);
    }
    const state = item.state;
    if (state !== undefined && !EXCHANGE_STATES.has(state as TranslationState)) {
      throw new Error(`${label}.${rawLanguage}.state is invalid.`);
    }
    translations[language] = {
      text: item.text,
      ...(state ? { state: state as TranslationState } : {}),
      ...(item.note === undefined
        ? {}
        : {
            note: requiredString(
              item.note,
              `${label}.${rawLanguage}.note`,
            ),
          }),
    };
  }
  return translations;
}

function normalizeEntry(
  value: unknown,
  index: number,
): ParsedTranslationExchangeEntry {
  const item = record(value, `entries[${index}]`);
  const key = requiredString(item.key, `entries[${index}].key`);
  return {
    key,
    ...(item.namespace === undefined
      ? {}
      : {
          namespace: requiredString(
            item.namespace,
            `entries[${index}].namespace`,
          ),
        }),
    kind: exchangeKind(item.kind, `entries[${index}].kind`),
    format: messageFormat(item.format, `entries[${index}].format`),
    ...(item.sourceText === undefined
      ? {}
      : {
          sourceText:
            typeof item.sourceText === 'string'
              ? item.sourceText
              : requiredString(item.sourceText, `entries[${index}].sourceText`),
        }),
    ...(item.keyVersionId === undefined
      ? {}
      : {
          keyVersionId: requiredString(
            item.keyVersionId,
            `entries[${index}].keyVersionId`,
          ),
        }),
    ...(item.sourceHash === undefined
      ? {}
      : {
          sourceHash: requiredString(
            item.sourceHash,
            `entries[${index}].sourceHash`,
          ),
        }),
    ...(item.contractHash === undefined
      ? {}
      : {
          contractHash: requiredString(
            item.contractHash,
            `entries[${index}].contractHash`,
          ),
        }),
    ...(item.argumentSignature === undefined
      ? {}
      : {
          argumentSignature: requiredString(
            item.argumentSignature,
            `entries[${index}].argumentSignature`,
          ),
        }),
    ...(item.description === undefined
      ? {}
      : {
          description: requiredString(
            item.description,
            `entries[${index}].description`,
          ),
        }),
    translations: normalizeTranslations(
      item.translations,
      `entries[${index}].translations`,
    ),
  };
}

/**
 * Normalize adapter output without inventing evidence missing from a foreign
 * file. Import disposition handles those entries as unverified later.
 */
export function normalizeParsedTranslationExchangeDocument(
  value: unknown,
): ParsedTranslationExchangeDocument {
  const input = record(value, 'Translation exchange document');
  if (input.schemaVersion !== 1) {
    throw new Error('Translation exchange schemaVersion must be 1.');
  }
  const sourceLanguage = canonicalLanguageTag(
    requiredString(input.sourceLanguage, 'sourceLanguage'),
  );
  const targetLanguages = canonicalLanguages(
    input.targetLanguages,
    'targetLanguages',
  );
  if (!Array.isArray(input.entries)) {
    throw new Error('entries must be an array.');
  }
  const entries = input.entries.map(normalizeEntry);
  const identities = new Set<string>();
  for (const entry of entries) {
    for (const language of Object.keys(entry.translations)) {
      const identity = `${entry.namespace ?? ''}\u0000${entry.key}\u0000${language}`;
      if (identities.has(identity)) {
        throw new Error(
          `Duplicate translation entry for "${entry.key}" in ${language}.`,
        );
      }
      identities.add(identity);
    }
  }
  return {
    schemaVersion: 1,
    ...(input.appId === undefined
      ? {}
      : { appId: requiredString(input.appId, 'appId') }),
    ...(input.branchId === undefined
      ? {}
      : { branchId: requiredString(input.branchId, 'branchId') }),
    sourceLanguage,
    targetLanguages,
    ...(input.exportedAt === undefined
      ? {}
      : { exportedAt: requiredString(input.exportedAt, 'exportedAt') }),
    ...(input.revisionWatermark === undefined
      ? {}
      : {
          revisionWatermark: requiredString(
            input.revisionWatermark,
            'revisionWatermark',
          ),
        }),
    ...(input.contractSetHash === undefined
      ? {}
      : {
          contractSetHash: requiredString(
            input.contractSetHash,
            'contractSetHash',
          ),
        }),
    entries,
  };
}

/** Validate the stronger, version-evidenced document required for CN exports. */
export function validateTranslationExchangeDocument(
  value: unknown,
): TranslationExchangeDocument {
  const parsed = normalizeParsedTranslationExchangeDocument(value);
  const entries = parsed.entries.map((entry, index): TranslationExchangeEntry => ({
    ...entry,
    sourceText:
      entry.sourceText ??
      requiredString(undefined, `entries[${index}].sourceText`),
    keyVersionId:
      entry.keyVersionId ??
      requiredString(undefined, `entries[${index}].keyVersionId`),
    sourceHash:
      entry.sourceHash ??
      requiredString(undefined, `entries[${index}].sourceHash`),
    contractHash:
      entry.contractHash ??
      requiredString(undefined, `entries[${index}].contractHash`),
    argumentSignature:
      entry.argumentSignature ??
      requiredString(undefined, `entries[${index}].argumentSignature`),
  }));
  return { ...parsed, entries };
}

export function isConfirmedBuildDeclaration(
  declaration: TranslationBuildDeclaration,
): boolean {
  return (
    (declaration.kind ?? 'ui') !== 'content' &&
    (declaration.status ?? 'confirmed') === 'confirmed' &&
    declaration.authoritative !== false
  );
}

export function registerTranslationFormatAdapter(
  adapter: TranslationFormatAdapter,
): void {
  if (adapters.has(adapter.format)) {
    throw new Error(
      `Translation format adapter "${adapter.format}" is already registered.`,
    );
  }
  adapters.set(adapter.format, adapter);
}

export function getTranslationFormatAdapter(
  format: TranslationFormat,
): TranslationFormatAdapter | undefined {
  return adapters.get(format);
}

export function listTranslationFormatAdapters(): TranslationFormatAdapter[] {
  return [...adapters.values()].sort((left, right) =>
    left.format.localeCompare(right.format),
  );
}

/** Test/host reset hook; adapters are registered explicitly by the host. */
export function clearTranslationFormatAdapters(): void {
  adapters.clear();
}
