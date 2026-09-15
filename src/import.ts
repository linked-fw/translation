/**
 * Translation import framework (Plan 014 AD-M / Plan 016 P2.1) — the minimal,
 * pluggable core that migrates existing translations INTO the graph. A
 * `TranslationImportSource` yields `(language, key, text)` triples; the shared
 * `runImport` pipeline maps them onto existing `TranslationKey`s and writes
 * `TranslationUnit`s via an injected target — no I/O of its own, so it is pure
 * and unit-testable, and P3 can add XLIFF/CSV/JSON sources behind the same
 * `TranslationImportSource` interface. The Tolgee CDN adapter is v1 (Plan 016
 * D3, Option A: pull the public per-language files, no auth).
 *
 * Design mirrors `key-sync.ts`: transport is injected, the sync is a pure diff.
 */
import {
  normalizeParsedTranslationExchangeDocument,
  type ParsedTranslationExchangeDocument,
  type ParsedTranslationExchangeEntry,
  type TranslationImportDisposition,
} from './exchange.js';
import { canonicalLanguageTag, sha256Hex } from './key-version.js';
import { canonicalJson } from './release.js';
import type {
  TranslationEntryRecord,
  TranslationState,
  TranslationUnitRecord,
} from './records.js';

/** How an incoming unit resolves against an existing app unit. */
export type ImportMergePolicy = 'skip-existing' | 'overwrite' | 'import-as-stale';

/** One incoming translation from a source, pre-mapping. */
export interface ParsedUnit {
  language: string;
  key: string;
  text: string;
}

/** A migration source (Tolgee CDN now; XLIFF/CSV/JSON later — AD-M). */
export interface TranslationImportSource {
  readonly name: string;
  /** Fetch + parse every `(language, key, text)` the source carries. */
  load(): Promise<ParsedUnit[]>;
}

export interface ImportOptions {
  /** Default `skip-existing` — never clobber an app-authored unit (Plan 016 D4). */
  mergePolicy?: ImportMergePolicy;
  /** The source/canonical language, NOT imported as units (it is `sourceText`). Default `en`. */
  sourceLanguage?: string;
  /** State written for imported units. Default `reviewed` (Plan 016 D3, Option A). */
  importState?: TranslationState;
  /** Report only; write nothing. */
  dryRun?: boolean;
}

/** Injected persistence — the pipeline stays free of any store/RPC (AD-G). */
export interface ImportTarget {
  /** Existing keys (with source text + format) this app owns. */
  listKeys(): Promise<Array<{ key: string; sourceText: string; format?: string }>>;
  /** Existing `(key, language)` units, for the merge policy. */
  listUnits(): Promise<Array<{ key: string; language: string }>>;
  /** Create/replace one unit. Not called on a dry run. */
  upsertUnit(data: {
    key: string;
    language: string;
    text: string;
    state: TranslationState;
  }): Promise<void>;
}

export interface ImportReport {
  source: string;
  dryRun: boolean;
  languages: string[];
  /** Units created (new). */
  created: number;
  /** Units overwritten (merge policy `overwrite`/`import-as-stale`). */
  updated: number;
  /** Units left alone under `skip-existing`. */
  skippedExisting: number;
  /** Source keys with no matching `TranslationKey` (reported, never created). */
  orphanKeys: string[];
  /** App keys the source has no translation for in any language (→ English fallback). */
  uncoveredKeys: string[];
  /** Source-language values that differ from the app's `sourceText` (drift). */
  sourceMismatches: Array<{ key: string; appSource: string; importSource: string }>;
  /** Simple-format keys whose imported text contains ICU plural/select syntax (AD-J/R8). */
  icuFlags: string[];
  perLanguage: Record<
    string,
    { created: number; updated: number; skippedExisting: number }
  >;
}

/** Detect ICU plural/select syntax that a `format:'simple'` key would render literally. */
export function hasIcuSyntax(text: string): boolean {
  return /\{[^{}]*,\s*(plural|select|selectordinal)\s*,/.test(text);
}

/**
 * Run a source through the shared pipeline: map → merge policy → state → lint →
 * report (and commit unless `dryRun`). Source-language values are compared to
 * `sourceText` (drift report) but never written as units — English is the
 * canonical inline default (AD-J/R7).
 */
export async function runImport(
  target: ImportTarget,
  source: TranslationImportSource,
  options: ImportOptions = {},
): Promise<ImportReport> {
  const mergePolicy = options.mergePolicy ?? 'skip-existing';
  const sourceLanguage = options.sourceLanguage ?? 'en';
  const importState = options.importState ?? 'reviewed';
  const dryRun = options.dryRun ?? false;

  const [parsed, keyRows, unitRows] = await Promise.all([
    source.load(),
    target.listKeys(),
    target.listUnits(),
  ]);

  const sourceText = new Map(keyRows.map((k) => [k.key, k.sourceText]));
  const formatOf = new Map(keyRows.map((k) => [k.key, k.format ?? 'simple']));
  const existingUnit = new Set(unitRows.map((u) => `${u.key}\u0000${u.language}`));

  const report: ImportReport = {
    source: source.name,
    dryRun,
    languages: [],
    created: 0,
    updated: 0,
    skippedExisting: 0,
    orphanKeys: [],
    uncoveredKeys: [],
    sourceMismatches: [],
    icuFlags: [],
    perLanguage: {},
  };

  const languages = new Set<string>();
  const orphans = new Set<string>();
  const icuFlags = new Set<string>();
  const coveredAppKeys = new Set<string>();
  const per = (lang: string) =>
    (report.perLanguage[lang] ??= { created: 0, updated: 0, skippedExisting: 0 });

  for (const unit of parsed) {
    if (!unit?.key || !unit.language) continue;
    languages.add(unit.language);

    // Source language: drift-check against sourceText, but never import as units.
    if (unit.language === sourceLanguage) {
      if (sourceText.has(unit.key)) {
        coveredAppKeys.add(unit.key);
        const app = sourceText.get(unit.key)!;
        if (app !== unit.text) {
          report.sourceMismatches.push({
            key: unit.key,
            appSource: app,
            importSource: unit.text,
          });
        }
      }
      continue;
    }

    if (!sourceText.has(unit.key)) {
      orphans.add(unit.key);
      continue;
    }
    coveredAppKeys.add(unit.key);
    if (formatOf.get(unit.key) === 'simple' && hasIcuSyntax(unit.text)) {
      icuFlags.add(unit.key);
    }

    const exists = existingUnit.has(`${unit.key}\u0000${unit.language}`);
    if (exists && mergePolicy === 'skip-existing') {
      report.skippedExisting++;
      per(unit.language).skippedExisting++;
      continue;
    }
    const state: TranslationState =
      mergePolicy === 'import-as-stale' ? 'stale' : importState;
    if (!dryRun) {
      await target.upsertUnit({
        key: unit.key,
        language: unit.language,
        text: unit.text,
        state,
      });
    }
    if (exists) {
      report.updated++;
      per(unit.language).updated++;
    } else {
      report.created++;
      per(unit.language).created++;
    }
  }

  report.languages = [...languages].sort();
  report.orphanKeys = [...orphans].sort();
  report.icuFlags = [...icuFlags].sort();
  report.uncoveredKeys = keyRows
    .map((k) => k.key)
    .filter((k) => !coveredAppKeys.has(k))
    .sort();
  return report;
}

/** Flatten nested JSON (Tolgee's CDN shape) into dot-joined leaf keys. */
export function flattenMessages(
  obj: unknown,
  prefix = '',
  out: Record<string, string> = {},
): Record<string, string> {
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenMessages(v, key, out);
    } else if (typeof v === 'string') {
      out[key] = v;
    } else if (v != null) {
      out[key] = String(v);
    }
  }
  return out;
}

/**
 * Tolgee CDN import source (Plan 016 D3, Option A). Pulls the public per-language
 * JSON files (no auth) and flattens Tolgee's nested structure to dot-keys that
 * match serve's `t('a.b.c')` keys. A language whose file is missing/unfetchable
 * is skipped (it simply contributes no units). `fetchImpl` is injectable for tests.
 */
export function tolgeeCdnSource(config: {
  baseUrl: string;
  languages: string[];
  fetchImpl?: typeof fetch;
}): TranslationImportSource {
  const base = config.baseUrl.replace(/\/+$/, '');
  const doFetch = config.fetchImpl ?? fetch;
  return {
    name: `tolgee-cdn(${base})`,
    async load() {
      const units: ParsedUnit[] = [];
      for (const language of config.languages) {
        let json: unknown;
        try {
          const res = await doFetch(`${base}/${language}.json`);
          if (!res.ok) continue;
          json = await res.json();
        } catch {
          continue;
        }
        for (const [key, text] of Object.entries(flattenMessages(json))) {
          units.push({ language, key, text });
        }
      }
      return units;
    },
  };
}

/**
 * Immutable, version-aware decision produced before any persistence is
 * attempted. Hosts may render these directly in an import dry-run.
 */
export interface VersionedImportDecision {
  readonly key: string;
  readonly importedKey: string;
  readonly language: string;
  readonly text: string;
  readonly state: TranslationState;
  readonly disposition: TranslationImportDisposition;
  readonly reason:
    | 'exact-current-version'
    | 'compatible-source-change'
    | 'incompatible-contract'
    | 'missing-version-evidence'
    | 'manager-bound-unverified'
    | 'orphan-key'
    | 'source-language'
    | 'existing-unit';
  readonly expectedKeyVersionId?: string;
  readonly expectedUnitContentHash?: string;
  readonly basedOnText?: string;
  readonly note?: string;
  readonly importedContentHash: string;
  readonly idempotencyKey: string;
}

export interface VersionedImportPlan {
  readonly sessionId: string;
  readonly documentHash: string;
  readonly revisionWatermark: string;
  readonly decisions: readonly VersionedImportDecision[];
}

export interface VersionedImportPlanOptions {
  sessionId: string;
  revisionWatermark: string;
  mergePolicy?: ImportMergePolicy;
  importState?: TranslationState;
  /**
   * Explicit manager-approved foreign-key mapping. A mapped value remains a
   * suggestion because the foreign file carries no trustworthy version proof.
   */
  managerBindings?: Readonly<Record<string, string>>;
}

export interface VersionedImportCurrentState {
  key: string;
  language: string;
  keyVersionId?: string;
  unitContentHash?: string;
}

export interface VersionedImportTarget {
  readCurrentState(
    requested: ReadonlyArray<{ key: string; language: string }>,
  ): Promise<VersionedImportCurrentState[]>;
  upsertUnit(data: {
    key: string;
    language: string;
    text: string;
    state: TranslationState;
    keyVersionId: string;
    source: 'import';
    idempotencyKey: string;
  }): Promise<void>;
  createSuggestion(data: {
    key: string;
    language: string;
    text: string;
    keyVersionId: string;
    basedOnText: string;
    source: 'import' | 'carry-forward';
    note?: string;
    idempotencyKey: string;
  }): Promise<void>;
}

export interface VersionedImportCommitReport {
  status: 'committed' | 'requires-redry-run';
  imported: number;
  suggested: number;
  skipped: number;
  completedIdempotencyKeys: string[];
}

/** Stable compare-and-set value for a current translation unit. */
export async function translationUnitContentHash(
  unit: Pick<TranslationUnitRecord, 'keyVersionId' | 'language' | 'text' | 'state'>,
): Promise<string> {
  return sha256Hex(
    canonicalJson([
      unit.keyVersionId ?? null,
      canonicalLanguageTag(unit.language),
      unit.text,
      unit.state,
    ]),
  );
}

function entryIdentity(entry: Pick<TranslationEntryRecord, 'namespace' | 'key'>): string {
  return `${entry.namespace ?? ''}\u0000${entry.key}`;
}

function parsedIdentity(entry: Pick<ParsedTranslationExchangeEntry, 'namespace' | 'key'>): string {
  return `${entry.namespace ?? ''}\u0000${entry.key}`;
}

async function makeVersionedDecision(input: {
  importedEntry: ParsedTranslationExchangeEntry;
  importedKey: string;
  language: string;
  text: string;
  state: TranslationState;
  note?: string;
  current?: TranslationEntryRecord;
  sessionId: string;
  mergePolicy: ImportMergePolicy;
  managerBound: boolean;
}): Promise<VersionedImportDecision> {
  const {
    importedEntry,
    importedKey,
    language,
    text,
    state,
    note,
    current,
    sessionId,
    mergePolicy,
    managerBound,
  } = input;
  const version = current?.currentVersion;
  const existing = current?.units[language];
  const expectedUnitContentHash = existing
    ? await translationUnitContentHash(existing)
    : undefined;
  const importedContentHash = await sha256Hex(
    canonicalJson([importedEntry.keyVersionId ?? null, language, text, state]),
  );
  const key = current?.key ?? importedKey;
  const idempotencyKey = await sha256Hex(
    canonicalJson([
      sessionId,
      version?.id ?? 'unverified',
      language,
      importedContentHash,
    ]),
  );
  const base = {
    key,
    importedKey,
    language,
    text,
    state,
    expectedKeyVersionId: version?.id,
    expectedUnitContentHash,
    note,
    importedContentHash,
    idempotencyKey,
  } as const;

  if (!current || !version) {
    return { ...base, disposition: 'conflict', reason: 'orphan-key' };
  }

  const hasEvidence = Boolean(
    importedEntry.keyVersionId &&
      importedEntry.sourceHash &&
      importedEntry.contractHash &&
      importedEntry.argumentSignature !== undefined &&
      importedEntry.sourceText !== undefined,
  );
  if (!hasEvidence) {
    if (managerBound) {
      return {
        ...base,
        disposition: 'unverified-source',
        reason: 'manager-bound-unverified',
        basedOnText: version.sourceText,
      };
    }
    return {
      ...base,
      disposition: 'unverified-source',
      reason: 'missing-version-evidence',
    };
  }

  if (
    importedEntry.contractHash !== version.contractHash ||
    importedEntry.argumentSignature !== version.argumentSignature ||
    importedEntry.format !== version.format
  ) {
    return {
      ...base,
      disposition: 'conflict',
      reason: 'incompatible-contract',
    };
  }

  const exactVersion =
    importedEntry.keyVersionId === version.id &&
    importedEntry.sourceHash === version.sourceHash &&
    importedEntry.sourceText === version.sourceText;
  if (!exactVersion) {
    return {
      ...base,
      disposition: 'carry-forward',
      reason: 'compatible-source-change',
      basedOnText: version.sourceText,
    };
  }

  if (existing && mergePolicy === 'skip-existing') {
    return { ...base, disposition: 'skip', reason: 'existing-unit' };
  }
  return { ...base, disposition: 'import', reason: 'exact-current-version' };
}

/**
 * Normalize and classify the complete document before any import write. Merge
 * policy is intentionally applied only after version compatibility succeeds.
 */
export async function planVersionedImport(
  value: unknown,
  currentEntries: readonly TranslationEntryRecord[],
  options: VersionedImportPlanOptions,
): Promise<VersionedImportPlan> {
  const document = normalizeParsedTranslationExchangeDocument(value);
  const mergePolicy = options.mergePolicy ?? 'skip-existing';
  const defaultState = options.importState ?? 'reviewed';
  const byIdentity = new Map(
    currentEntries.map((entry) => [entryIdentity(entry), entry]),
  );
  const byKey = new Map(currentEntries.map((entry) => [entry.key, entry]));
  const decisions: VersionedImportDecision[] = [];

  for (const importedEntry of [...document.entries].sort((left, right) =>
    parsedIdentity(left).localeCompare(parsedIdentity(right)),
  )) {
    const boundKey = options.managerBindings?.[importedEntry.key];
    const current =
      (boundKey ? byKey.get(boundKey) : undefined) ??
      byIdentity.get(parsedIdentity(importedEntry));
    for (const [rawLanguage, value] of Object.entries(
      importedEntry.translations,
    ).sort(([left], [right]) => left.localeCompare(right))) {
      const language = canonicalLanguageTag(rawLanguage);
      if (language === document.sourceLanguage) {
        const importedContentHash = await sha256Hex(
          canonicalJson([importedEntry.keyVersionId ?? null, language, value.text]),
        );
        decisions.push({
          key: current?.key ?? importedEntry.key,
          importedKey: importedEntry.key,
          language,
          text: value.text,
          state: value.state ?? defaultState,
          disposition: 'skip',
          reason: 'source-language',
          expectedKeyVersionId: current?.currentVersion?.id,
          importedContentHash,
          idempotencyKey: await sha256Hex(
            canonicalJson([options.sessionId, 'source-language', language, importedContentHash]),
          ),
        });
        continue;
      }
      const state =
        mergePolicy === 'import-as-stale'
          ? 'stale'
          : (value.state ?? defaultState);
      decisions.push(
        await makeVersionedDecision({
          importedEntry,
          importedKey: importedEntry.key,
          language,
          text: value.text,
          state,
          note: value.note,
          current,
          sessionId: options.sessionId,
          mergePolicy,
          managerBound: Boolean(boundKey),
        }),
      );
    }
  }

  return Object.freeze({
    sessionId: options.sessionId,
    documentHash: await sha256Hex(canonicalJson(document)),
    revisionWatermark: options.revisionWatermark,
    decisions: Object.freeze(decisions.map((decision) => Object.freeze(decision))),
  });
}

/**
 * Compare-and-set commit. The entire requested batch is re-read and validated
 * before its first write, so stale dry-runs cannot partially mutate the batch.
 */
export async function commitVersionedImport(
  plan: VersionedImportPlan,
  target: VersionedImportTarget,
  options: { completedIdempotencyKeys?: ReadonlySet<string> } = {},
): Promise<VersionedImportCommitReport> {
  const completed = options.completedIdempotencyKeys ?? new Set<string>();
  const actionable = plan.decisions.filter(
    (decision) =>
      !completed.has(decision.idempotencyKey) &&
      (decision.disposition === 'import' ||
        decision.disposition === 'carry-forward' ||
        (decision.disposition === 'unverified-source' &&
          decision.reason === 'manager-bound-unverified')),
  );
  const current = await target.readCurrentState(
    actionable.map(({ key, language }) => ({ key, language })),
  );
  const currentByIdentity = new Map(
    current.map((item) => [`${item.key}\u0000${item.language}`, item]),
  );
  const drifted = actionable.some((decision) => {
    const actual = currentByIdentity.get(
      `${decision.key}\u0000${decision.language}`,
    );
    return (
      actual?.keyVersionId !== decision.expectedKeyVersionId ||
      actual?.unitContentHash !== decision.expectedUnitContentHash
    );
  });
  if (drifted) {
    return {
      status: 'requires-redry-run',
      imported: 0,
      suggested: 0,
      skipped: plan.decisions.length,
      completedIdempotencyKeys: [...completed],
    };
  }

  let imported = 0;
  let suggested = 0;
  const completedKeys = [...completed];
  for (const decision of actionable) {
    if (!decision.expectedKeyVersionId) continue;
    if (decision.disposition === 'import') {
      await target.upsertUnit({
        key: decision.key,
        language: decision.language,
        text: decision.text,
        state: decision.state,
        keyVersionId: decision.expectedKeyVersionId,
        source: 'import',
        idempotencyKey: decision.idempotencyKey,
      });
      imported++;
    } else {
      await target.createSuggestion({
        key: decision.key,
        language: decision.language,
        text: decision.text,
        keyVersionId: decision.expectedKeyVersionId,
        basedOnText: decision.basedOnText ?? '',
        source:
          decision.disposition === 'carry-forward'
            ? 'carry-forward'
            : 'import',
        note: decision.note,
        idempotencyKey: decision.idempotencyKey,
      });
      suggested++;
    }
    completedKeys.push(decision.idempotencyKey);
  }
  return {
    status: 'committed',
    imported,
    suggested,
    skipped: plan.decisions.length - actionable.length,
    completedIdempotencyKeys: completedKeys,
  };
}
