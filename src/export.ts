import {
  validateTranslationExchangeDocument,
  type TranslationExchangeDocument,
  type TranslationExchangeEntry,
} from './exchange.js';
import { canonicalLanguageTag, sha256Hex } from './key-version.js';
import { canonicalJson, translationContractSetHash } from './release.js';
import type {
  TranslationEntryRecord,
  TranslationState,
} from './records.js';

export interface TranslationExportOptions {
  appId?: string;
  branchId?: string;
  sourceLanguage: string;
  revisionWatermark: string;
  exportedAt?: string;
  languages?: readonly string[];
  namespaces?: readonly string[];
  keys?: readonly string[];
  states?: readonly TranslationState[];
}

export interface TranslationExportFinding {
  key: string;
  code: 'content-key-unsupported' | 'missing-current-version';
  message: string;
}

export interface TranslationExportResult {
  document: TranslationExchangeDocument;
  documentHash: string;
  findings: TranslationExportFinding[];
}

/**
 * Build one deterministic, version-evidenced exchange snapshot. Content keys
 * and versionless keys are reported rather than silently losing metadata.
 */
export async function createTranslationExchangeDocument(
  entries: readonly TranslationEntryRecord[],
  options: TranslationExportOptions,
): Promise<TranslationExportResult> {
  const sourceLanguage = canonicalLanguageTag(options.sourceLanguage);
  const languageFilter = options.languages
    ? new Set(options.languages.map(canonicalLanguageTag))
    : undefined;
  const namespaceFilter = options.namespaces
    ? new Set(options.namespaces)
    : undefined;
  const keyFilter = options.keys ? new Set(options.keys) : undefined;
  const stateFilter = options.states ? new Set(options.states) : undefined;
  const findings: TranslationExportFinding[] = [];
  const exportEntries: TranslationExchangeEntry[] = [];

  for (const entry of [...entries].sort((left, right) =>
    `${left.namespace}\u0000${left.key}`.localeCompare(
      `${right.namespace}\u0000${right.key}`,
    ),
  )) {
    if (namespaceFilter && !namespaceFilter.has(entry.namespace)) continue;
    if (keyFilter && !keyFilter.has(entry.key)) continue;
    if (entry.kind === 'content') {
      findings.push({
        key: entry.key,
        code: 'content-key-unsupported',
        message: 'Content translations are not part of the UI exchange format.',
      });
      continue;
    }
    const version = entry.currentVersion;
    if (!version) {
      findings.push({
        key: entry.key,
        code: 'missing-current-version',
        message: 'The key has no current immutable version.',
      });
      continue;
    }
    const translations: TranslationExchangeEntry['translations'] = {};
    for (const [rawLanguage, unit] of Object.entries(entry.units).sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      const language = canonicalLanguageTag(rawLanguage);
      if (language === sourceLanguage) continue;
      if (languageFilter && !languageFilter.has(language)) continue;
      if (stateFilter && !stateFilter.has(unit.state)) continue;
      translations[language] = {
        text: unit.text,
        state: unit.state,
      };
    }
    exportEntries.push({
      key: entry.key,
      namespace: entry.namespace,
      kind:
        entry.ofShape || entry.ofProperty || entry.fromPackage
          ? 'semantic'
          : 'ui',
      sourceText: version.sourceText,
      keyVersionId: version.id,
      sourceHash: version.sourceHash,
      contractHash: version.contractHash,
      argumentSignature: version.argumentSignature,
      description: entry.description,
      format: version.format,
      translations,
    });
  }

  const targetLanguages = [
    ...new Set(
      exportEntries.flatMap((entry) => Object.keys(entry.translations)),
    ),
  ].sort();
  const document = validateTranslationExchangeDocument({
    schemaVersion: 1,
    appId: options.appId,
    branchId: options.branchId,
    sourceLanguage,
    targetLanguages,
    exportedAt: options.exportedAt,
    revisionWatermark: options.revisionWatermark,
    contractSetHash: await translationContractSetHash(
      entries.filter((entry) => entry.kind === 'ui') as TranslationEntryRecord[],
    ),
    entries: exportEntries,
  });
  return {
    document,
    documentHash: await sha256Hex(canonicalJson(document)),
    findings,
  };
}
