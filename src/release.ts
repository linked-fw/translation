import type { TranslationLanguageDefinition } from './languages.js';
import { runChecks, type CheckFinding } from './checks.js';
import { compileLanguage } from './compile.js';
import type { TranslationMessages } from './core/messages.js';
import { classifyKeyVersion, sha256Hex } from './key-version.js';
import {
  isConfirmedBuildDeclaration,
  type TranslationBuildDeclaration,
} from './exchange.js';
import type { GlossaryTermRecord, TranslationEntryRecord } from './records.js';
import type { ExtractedTranslationKey } from './key-sync.js';

export interface TranslationBuildDescriptor {
  schemaVersion: 2;
  appId: string;
  releaseId: string;
  contractSetHash: string;
  manifestUrl: string;
}

/** Serializable handoff from translation publication to an exact app build. */
export interface TranslationBuildPin {
  schemaVersion: 1;
  appId: string;
  branchId: string;
  buildId: string;
  channel: 'preview' | 'production';
  releaseId: string;
  contractSetHash: string;
  manifestHash: string;
  manifestUrl: string;
  /** Sequence baked into the fallback catalogs at build time. */
  hotfixSequence: number;
  catalogs: Record<string, TranslationCatalogObject>;
  pinnedAt: string;
  /** Which declaration source supplied the contract verifier for this build. */
  inventorySource?: 'confirmed-inventory' | 'static-fallback';
}

export interface TranslationCatalogObject {
  hash: string;
  url: string;
  bytes: number;
  encoding?: 'gzip';
}

export interface TranslationCatalogPatchObject
  extends TranslationCatalogObject {
  sequence: number;
}

export interface TranslationQualitySummary {
  errors: number;
  warnings: number;
  rules: Record<string, number>;
}

export interface TranslationReleaseManifest {
  languageResources?: TranslationLanguageDefinition[];
  schemaVersion: 2;
  releaseId: string;
  contractSetHash: string;
  hotfixSequence: number;
  revisionWatermark?: string;
  /** Compact release selection index: logical key → exact key-version IRI. */
  keyVersions: Record<string, string>;
  quality: Record<string, TranslationQualitySummary>;
  languages: Record<
    string,
    {
      base: TranslationCatalogObject;
      patches: TranslationCatalogPatchObject[];
    }
  >;
}

export interface TranslationCatalogPatch {
  set: TranslationMessages;
  remove?: string[];
}

export interface CompileReleaseInput {
  languageResources?: TranslationLanguageDefinition[];
  appId: string;
  branchId: string;
  buildId?: string;
  releaseId?: string;
  publicBase?: string;
  channel?: 'preview' | 'production';
  languages: string[];
  defaultLanguage: string;
  reviewedOnlyLanguages?: Iterable<string>;
  previousRelease?: TranslationReleaseManifest;
  revisionWatermark?: string;
  glossary?: GlossaryTermRecord[];
  allowQualityErrors?: boolean;
}

export interface CompiledTranslationRelease {
  descriptor: TranslationBuildDescriptor;
  manifest: TranslationReleaseManifest;
  manifestHash: string;
  immutableObjects: Array<{
    kind: 'base' | 'patch';
    hash: string;
    body: Uint8Array;
  }>;
}

export interface TranslationReleaseReuseCandidate {
  releaseId: string;
  manifestHash: string;
}

export interface CompiledTranslationHotfix {
  key: string;
  language: string;
  sequence: number;
  patch: TranslationCatalogPatch;
  immutableObject: {
    kind: 'patch';
    hash: string;
    body: Uint8Array;
  };
  manifest: TranslationReleaseManifest;
}

export interface CompiledTranslationCompaction {
  language: string;
  immutableObject: {
    kind: 'base';
    hash: string;
    body: Uint8Array;
  };
  manifest: TranslationReleaseManifest;
}

export interface TranslationObjectInventoryEntry {
  /** App-relative object name, for example `objects/catalog/<hash>.json`. */
  name: string;
  lastModified?: Date | string;
}

export interface TranslationCompactionThresholds {
  maxPatches?: number;
  maxPatchToBaseRatio?: number;
}

export const DEFAULT_TRANSLATION_MAX_PATCHES = 8;
export const DEFAULT_TRANSLATION_PATCH_TO_BASE_RATIO = 0.25;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Recursive canonical JSON used for every content-addressed release object. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function translationContracts(entries: TranslationEntryRecord[]) {
  return entries
    .filter((entry) => entry.kind === 'ui')
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((entry) => ({
      key: entry.key,
      versionId: entry.currentVersion?.id ?? null,
      contractHash: entry.currentVersion?.contractHash ?? null,
    }));
}

/** The one canonical contract-set hash used by release compile and build pinning. */
export async function translationContractSetHash(
  entries: TranslationEntryRecord[]
): Promise<string> {
  return sha256Hex(canonicalJson(translationContracts(entries)));
}

/**
 * Resolve keys extracted from one immutable build workspace to graph versions.
 * Any missing/orphaned/conflicting/default-drifted key fails before publication.
 */
export async function buildSnapshotContractSetHash(
  entries: TranslationEntryRecord[],
  extracted: Array<ExtractedTranslationKey | TranslationBuildDeclaration>
): Promise<string> {
  const declarations = extracted.filter(isConfirmedBuildDeclaration);
  const declarationsByKey = new Map<string, TranslationBuildDeclaration[]>();
  for (const item of declarations) {
    const values = declarationsByKey.get(item.key) ?? [];
    values.push(item);
    declarationsByKey.set(item.key, values);
  }
  const selected = entries
    .filter((entry) => entry.kind === 'ui')
    .sort((left, right) => left.key.localeCompare(right.key));
  const graphKeys = new Set(selected.map(({ key }) => key));
  const missing = [...declarationsByKey.keys()]
    .filter((key) => !graphKeys.has(key))
    .sort();
  const orphaned = selected
    .map(({ key }) => key)
    .filter((key) => !declarationsByKey.has(key))
    .sort();
  if (missing.length || orphaned.length) {
    throw new Error(
      `Build translation contract differs from the release: ${
        missing.length ? `missing in graph [${missing.join(', ')}]` : ''
      }${missing.length && orphaned.length ? '; ' : ''}${
        orphaned.length ? `missing in build [${orphaned.join(', ')}]` : ''
      }.`
    );
  }

  for (const entry of selected) {
    const current = entry.currentVersion;
    if (!current?.id) {
      throw new Error(
        `Translation key "${entry.key}" has no current contract version.`
      );
    }
    const contracts = (declarationsByKey.get(entry.key) ?? []).map(
      (declaration) => ({
        sourceText: declaration.sourceText,
        // Legacy static extraction has no format. Preserve its shipped behavior
        // by resolving against the current graph contract.
        format: declaration.format ?? current.format ?? entry.format,
      })
    );
    const distinct = new Map(
      contracts.map((contract) => [
        canonicalJson([contract.sourceText, contract.format]),
        contract,
      ])
    );
    if (distinct.size > 1) {
      throw new Error(
        `Build translation key "${entry.key}" has conflicting source defaults or formats.`
      );
    }
    const extractedContract = [...distinct.values()][0];
    const decision = classifyKeyVersion(current, extractedContract);
    if (decision.action !== 'unchanged') {
      throw new Error(
        `Build translation source for "${entry.key}" does not match its current key version (${decision.reason}).`
      );
    }
  }
  return translationContractSetHash(selected);
}

export function assertTranslationContractSet(
  buildContractSetHash: string,
  releaseContractSetHash: string
): void {
  if (buildContractSetHash !== releaseContractSetHash) {
    throw new Error(
      `Build translation contract ${buildContractSetHash} does not match release contract ${releaseContractSetHash}.`
    );
  }
}

/** Verify immutable catalog bytes before a build adapter writes them. */
export async function assertTranslationObjectHash(
  value: string | Uint8Array,
  expectedHash: string
): Promise<void> {
  const text = typeof value === 'string' ? value : decoder.decode(value);
  const actual = await sha256Hex(text);
  if (actual !== expectedHash) {
    throw new Error(
      `Translation object hash mismatch: expected ${expectedHash}, received ${actual}.`
    );
  }
}

export function createTranslationBuildPin(input: {
  descriptor: TranslationBuildDescriptor;
  manifest: TranslationReleaseManifest;
  manifestHash: string;
  branchId: string;
  buildId: string;
  channel: 'preview' | 'production';
  pinnedAt?: string;
  inventorySource?: 'confirmed-inventory' | 'static-fallback';
}): TranslationBuildPin {
  if (
    input.manifest.releaseId !== input.descriptor.releaseId ||
    input.manifest.contractSetHash !== input.descriptor.contractSetHash
  ) {
    throw new Error(
      'Translation release descriptor and manifest are incompatible.'
    );
  }
  return {
    schemaVersion: 1,
    appId: input.descriptor.appId,
    branchId: input.branchId,
    buildId: input.buildId,
    channel: input.channel,
    releaseId: input.descriptor.releaseId,
    contractSetHash: input.descriptor.contractSetHash,
    manifestHash: input.manifestHash,
    manifestUrl: input.descriptor.manifestUrl,
    hotfixSequence: input.manifest.hotfixSequence,
    catalogs: Object.fromEntries(
      Object.entries(input.manifest.languages).map(([language, lane]) => [
        language,
        lane.base,
      ])
    ),
    pinnedAt: input.pinnedAt ?? new Date().toISOString(),
    ...(input.inventorySource
      ? { inventorySource: input.inventorySource }
      : {}),
  };
}

export function decodeReleaseObject(body: Uint8Array): unknown {
  return JSON.parse(decoder.decode(body));
}

export function applyCatalogPatches(
  base: TranslationMessages,
  patches: TranslationCatalogPatch[]
): TranslationMessages {
  const result: TranslationMessages = { ...base };
  for (const patch of patches) {
    for (const key of patch.remove ?? []) delete result[key];
    Object.assign(result, patch.set);
  }
  return result;
}

export function releaseReferencesKeyVersion(
  manifest: TranslationReleaseManifest,
  keyVersionId: string
): boolean {
  return Object.values(manifest.keyVersions).includes(keyVersionId);
}

export function keyForVersion(
  manifest: TranslationReleaseManifest,
  keyVersionId: string
): string | undefined {
  return Object.entries(manifest.keyVersions).find(
    ([, version]) => version === keyVersionId
  )?.[0];
}

export function shouldCompactTranslationLanguage(
  lane: TranslationReleaseManifest['languages'][string],
  thresholds: TranslationCompactionThresholds = {}
): boolean {
  const maxPatches = thresholds.maxPatches ?? DEFAULT_TRANSLATION_MAX_PATCHES;
  const maxPatchToBaseRatio =
    thresholds.maxPatchToBaseRatio ?? DEFAULT_TRANSLATION_PATCH_TO_BASE_RATIO;
  if (lane.patches.length > maxPatches) return true;
  if (lane.base.bytes <= 0) return lane.patches.length > 0;
  const patchBytes = lane.patches.reduce(
    (total, patch) => total + patch.bytes,
    0
  );
  return patchBytes > lane.base.bytes * maxPatchToBaseRatio;
}

function publicBaseFromObjectUrl(url: string): string | undefined {
  const marker = '/objects/';
  const index = url.indexOf(marker);
  return index < 0 ? undefined : url.slice(0, index);
}

/**
 * Replace one eligible patch chain with an equivalent immutable base. The
 * release identity, contract set, and hotfix sequence deliberately do not
 * change because compaction changes representation, not translation content.
 */
export async function compileTranslationCompaction(input: {
  manifest: TranslationReleaseManifest;
  language: string;
  currentMessages: TranslationMessages;
  force?: boolean;
  thresholds?: TranslationCompactionThresholds;
}): Promise<CompiledTranslationCompaction | null> {
  const lane = input.manifest.languages[input.language];
  if (!lane) {
    throw new Error(
      `Release ${input.manifest.releaseId} does not publish ${input.language}.`
    );
  }
  if (
    !input.force &&
    !shouldCompactTranslationLanguage(lane, input.thresholds)
  ) {
    return null;
  }
  if (lane.patches.length === 0) return null;

  const body = encoder.encode(canonicalJson(input.currentMessages));
  const hash = await sha256Hex(decoder.decode(body));
  const base: TranslationCatalogObject = {
    hash,
    url: objectUrl(
      publicBaseFromObjectUrl(lane.base.url),
      `objects/catalog/${hash}.json`
    ),
    bytes: body.byteLength,
  };
  return {
    language: input.language,
    immutableObject: { kind: 'base', hash, body },
    manifest: {
      ...input.manifest,
      languages: {
        ...input.manifest.languages,
        [input.language]: {
          base,
          patches: [],
        },
      },
    },
  };
}

function objectNameFromUrl(url: string, fallback: string): string {
  const clean = url.split(/[?#]/, 1)[0].replace(/^\/+/, '');
  const marker = 'objects/';
  const index = clean.indexOf(marker);
  return index >= 0 ? clean.slice(index) : fallback;
}

/** Every immutable object directly reachable from the supplied manifests. */
export function collectReferencedTranslationObjects(
  manifests: Iterable<TranslationReleaseManifest>
): Set<string> {
  const referenced = new Set<string>();
  for (const manifest of manifests) {
    for (const lane of Object.values(manifest.languages)) {
      referenced.add(
        objectNameFromUrl(
          lane.base.url,
          `objects/catalog/${lane.base.hash}.json${
            lane.base.encoding === 'gzip' ? '.gz' : ''
          }`
        )
      );
      for (const patch of lane.patches) {
        referenced.add(
          objectNameFromUrl(
            patch.url,
            `objects/patch/${patch.hash}.json${
              patch.encoding === 'gzip' ? '.gz' : ''
            }`
          )
        );
      }
    }
  }
  return referenced;
}

/**
 * Mark only old, content-addressed objects that are absent from every retained
 * manifest. Unknown timestamps fail closed and remain retained.
 */
export function selectPrunableTranslationObjects(input: {
  objects: Iterable<TranslationObjectInventoryEntry>;
  manifests: Iterable<TranslationReleaseManifest>;
  now?: Date | number;
  gracePeriodMs: number;
}): string[] {
  if (!Number.isFinite(input.gracePeriodMs) || input.gracePeriodMs < 0) {
    throw new Error('gracePeriodMs must be a non-negative finite number.');
  }
  const now =
    input.now instanceof Date ? input.now.getTime() : input.now ?? Date.now();
  const referenced = collectReferencedTranslationObjects(input.manifests);
  const candidates = new Set<string>();
  for (const object of input.objects) {
    const name = object.name.replace(/^\/+/, '');
    if (
      !/^objects\/(?:catalog|patch)\/[^/]+\.json(?:\.gz)?$/.test(name) ||
      referenced.has(name) ||
      !object.lastModified
    ) {
      continue;
    }
    const modifiedAt =
      object.lastModified instanceof Date
        ? object.lastModified.getTime()
        : new Date(object.lastModified).getTime();
    if (
      Number.isFinite(modifiedAt) &&
      now - modifiedAt >= input.gracePeriodMs
    ) {
      candidates.add(name);
    }
  }
  return [...candidates].sort();
}

/**
 * Create one content-addressed language patch and advance a compatible
 * manifest. Returns null for an idempotent re-approval of the current value.
 */
export async function compileTranslationHotfix(input: {
  manifest: TranslationReleaseManifest;
  keyVersionId: string;
  language: string;
  text: string;
  currentMessages: TranslationMessages;
}): Promise<CompiledTranslationHotfix | null> {
  const key = keyForVersion(input.manifest, input.keyVersionId);
  if (!key) {
    throw new Error(
      `Release ${input.manifest.releaseId} does not reference key version ${input.keyVersionId}.`
    );
  }
  const lane = input.manifest.languages[input.language];
  if (!lane) {
    throw new Error(
      `Release ${input.manifest.releaseId} does not publish ${input.language}.`
    );
  }
  const current = input.currentMessages[key];
  const next =
    typeof current === 'object' && current?.format === 'icu'
      ? { message: input.text, format: 'icu' as const }
      : input.text;
  if (canonicalJson(current) === canonicalJson(next)) return null;

  const patch: TranslationCatalogPatch = { set: { [key]: next } };
  const body = encoder.encode(canonicalJson(patch));
  const hash = await sha256Hex(decoder.decode(body));
  const sequence = input.manifest.hotfixSequence + 1;
  const publicBase = publicBaseFromObjectUrl(lane.base.url);
  const patchObject: TranslationCatalogPatchObject = {
    hash,
    url: objectUrl(publicBase, `objects/patch/${hash}.json`),
    bytes: body.byteLength,
    sequence,
  };
  return {
    key,
    language: input.language,
    sequence,
    patch,
    immutableObject: { kind: 'patch', hash, body },
    manifest: {
      ...input.manifest,
      hotfixSequence: sequence,
      languages: {
        ...input.manifest.languages,
        [input.language]: {
          ...lane,
          patches: [...lane.patches, patchObject],
        },
      },
    },
  };
}

function qualitySummary(findings: CheckFinding[]): TranslationQualitySummary {
  const rules: Record<string, number> = {};
  let errors = 0;
  let warnings = 0;
  for (const finding of findings) {
    finding.severity === 'error' ? errors++ : warnings++;
    rules[finding.rule] = (rules[finding.rule] ?? 0) + 1;
  }
  return { errors, warnings, rules };
}

function objectUrl(publicBase: string | undefined, path: string): string {
  const base = publicBase?.replace(/\/+$/, '');
  return base ? `${base}/${path}` : path;
}

/**
 * Compile one immutable schema-v2 release. The input entries are the captured
 * graph snapshot; callers are responsible for supplying its revision watermark.
 */
export async function compileRelease(
  entries: TranslationEntryRecord[],
  input: CompileReleaseInput
): Promise<CompiledTranslationRelease> {
  const reviewedOnly = new Set(input.reviewedOnlyLanguages ?? []);
  const selected = entries
    .filter((entry) => entry.kind === 'ui')
    .sort((left, right) => left.key.localeCompare(right.key));
  const missingVersion = selected.find((entry) => !entry.currentVersion?.id);
  if (missingVersion) {
    throw new Error(
      `Translation key "${missingVersion.key}" has no current contract version.`
    );
  }
  const keyVersions = Object.fromEntries(
    selected.map((entry) => [entry.key, entry.currentVersion!.id])
  );
  const contractSetHash = await translationContractSetHash(selected);
  const releaseSeed = canonicalJson([
    input.appId,
    input.branchId,
    input.buildId ?? '',
    contractSetHash,
  ]);
  const releaseId =
    input.releaseId?.trim() ||
    `release-${(await sha256Hex(releaseSeed)).slice(0, 24)}`;
  const immutableObjects: CompiledTranslationRelease['immutableObjects'] = [];
  const languages: TranslationReleaseManifest['languages'] = {};
  const quality: TranslationReleaseManifest['quality'] = {};

  for (const language of [...new Set(input.languages)].sort()) {
    const payload = compileLanguage(selected, language, {
      defaultLanguage: input.defaultLanguage,
      reviewedOnly: reviewedOnly.has(language),
      languageResources: input.languageResources,
    });
    const body = encoder.encode(canonicalJson(payload));
    const hash = await sha256Hex(decoder.decode(body));
    immutableObjects.push({ kind: 'base', hash, body });
    languages[language] = {
      base: {
        hash,
        url: objectUrl(input.publicBase, `objects/catalog/${hash}.json`),
        bytes: body.byteLength,
      },
      patches: [],
    };
    const checkedEntries = selected.map((entry) => {
      const message = payload[entry.key];
      const text =
        typeof message === 'string' ? message : message?.message ?? '';
      return {
        ...entry,
        units: {
          ...entry.units,
          [language]: {
            language,
            text,
            state: entry.units[language]?.state ?? 'untranslated',
          },
        },
      };
    });
    quality[language] = qualitySummary(
      language === input.defaultLanguage
        ? []
        : runChecks(checkedEntries, language, input.glossary ?? [])
    );
  }

  const errorCount = Object.values(quality).reduce(
    (total, summary) => total + summary.errors,
    0
  );
  if (
    input.channel === 'production' &&
    errorCount > 0 &&
    !input.allowQualityErrors
  ) {
    throw new Error(
      `Production translation release blocked by ${errorCount} quality error${
        errorCount === 1 ? '' : 's'
      }.`
    );
  }

  const manifest: TranslationReleaseManifest = {
    schemaVersion: 2,
    releaseId,
    contractSetHash,
    hotfixSequence: 0,
    ...(input.revisionWatermark
      ? { revisionWatermark: input.revisionWatermark }
      : {}),
    keyVersions,
    quality,
    languages,
    ...(input.languageResources
      ? { languageResources: input.languageResources }
      : {}),
  };
  const manifestHash = await sha256Hex(canonicalJson(manifest));
  return {
    descriptor: {
      schemaVersion: 2,
      appId: input.appId,
      releaseId,
      contractSetHash,
      manifestUrl: objectUrl(
        input.publicBase,
        `releases/${releaseId}/manifest.json`
      ),
    },
    manifest,
    manifestHash,
    immutableObjects,
  };
}

/**
 * Recompile content beneath existing release identities and reuse only an
 * exact manifest match. Contract equality alone is insufficient because
 * selected translations, language policy, quality, or delivery URLs may differ.
 */
export async function findReusableCompiledRelease(
  entries: TranslationEntryRecord[],
  input: Omit<CompileReleaseInput, 'releaseId' | 'buildId'>,
  candidates: TranslationReleaseReuseCandidate[]
): Promise<CompiledTranslationRelease | null> {
  for (const candidate of candidates) {
    const compiled = await compileRelease(entries, {
      ...input,
      releaseId: candidate.releaseId,
    });
    if (compiled.manifestHash === candidate.manifestHash) return compiled;
  }
  return null;
}
