import { ShapeProvider } from '@_linked/server-utils/utils/ShapeProvider';
import type {
  GlossaryTermRecord,
  TranslationEntryRecord,
  TranslationMemoryMatchRecord,
  TranslationMemoryPretranslateCandidate,
  TranslationMemoryPretranslateReport,
  TranslationMemoryRecord,
  TranslationProposalDecision,
  TranslationRevisionRecord,
  TranslationRevisionStatus,
  TranslationState,
  TranslationKeyVersionRecord,
  TranslationReleaseRecord,
  TranslationUnitRecord,
} from '../records.js';
import { TranslationKey } from './TranslationKey.js';
import { TranslationKeyVersion } from './TranslationKeyVersion.js';
import { TranslationRelease } from './TranslationRelease.js';
import { TranslationUnit } from './TranslationUnit.js';
import { TranslationRevision } from './TranslationRevision.js';
import { GlossaryTerm } from './GlossaryTerm.js';
import type { TranslationMessages } from '../core/messages.js';
import {
  classifyKeyVersion,
  createMonotonicVersionId,
  deriveBackfillKeyVersion,
  deriveTranslationKeyVersionContract,
} from '../key-version.js';
import {
  canAuthorTranslation,
  type TranslationAuthoringAction,
} from '../authorization.js';

export interface TranslationKeyInput {
  appId: string;
  key: string;
  sourceText: string;
  namespace?: string;
  description?: string;
  kind?: 'ui' | 'content';
  ofNode?: string;
  ofField?: string;
  ofShape?: string;
  ofProperty?: string;
  fromPackage?: string;
  /** Force the override flag; when omitted it is derived (see upsertTranslationKey). */
  overridden?: boolean;
  format?: 'simple' | 'icu';
  sourceLanguage?: string;
}

export interface TranslationUnitInput {
  appId: string;
  key: string;
  language: string;
  text: string;
  state?: TranslationState;
  updatedBy?: string;
}

/** Who/what authored a unit write — recorded on its `applied` revision (AD-P). */
export interface TranslationAuthorship {
  /** WebID of the human author, or the MT provider IRI. */
  author?: string;
  authorKind?: 'human' | 'machine';
  /** MT provider key when authorKind is 'machine'. */
  mtProvider?: string;
  note?: string;
}

type TranslationKeyRow = Omit<TranslationEntryRecord, 'units'>;
type TranslationUnitRow = TranslationUnitRecord & {
  ofKey?: { key?: string };
  ofKeyVersion?: string | { id?: string };
};
type TranslationKeyVersionRow = TranslationKeyVersionRecord & {
  ofKey?: { key?: string };
};
type TranslationMemoryUnitRow = {
  id?: string | { id?: string };
  language?: string;
  text?: string;
  state?: string;
  updatedAt?: string;
  ofKey?: { key?: string };
  ofKeyVersion?:
    | string
    | {
        id?: string;
        sourceText?: string;
        sourceHash?: string;
        contractHash?: string;
      };
};

const iri = (value: unknown): string | undefined =>
  typeof value === 'string'
    ? value
    : (value as { id?: string } | undefined)?.id;

const isoDate = (value: string | Date | undefined): string | undefined =>
  value instanceof Date ? value.toISOString() : value || undefined;

function toKeyVersionRecord(
  row: TranslationKeyVersionRow,
): TranslationKeyVersionRecord | null {
  const id = iri((row as any).id) ?? iri(row);
  if (!id || !row.versionId) return null;
  return {
    id,
    versionId: row.versionId,
    sourceLanguage: row.sourceLanguage || 'en',
    sourceText: row.sourceText ?? '',
    format: row.format === 'icu' ? 'icu' : 'simple',
    argumentSignature: row.argumentSignature || '[]',
    contractHash: row.contractHash || '',
    sourceHash: row.sourceHash || '',
    supersedes: iri(row.supersedes),
    createdAt: isoDate(row.createdAt) || undefined,
    createdBy: iri(row.createdBy),
  };
}

/**
 * Shared TM/carry-forward classifier (Plan 018 §5.5). Exact source matches may
 * cross logical keys; changed-source carry-forward candidates never do.
 */
export function classifyTranslationMemoryMatches(input: {
  key: string;
  language: string;
  currentVersion: TranslationKeyVersionRecord;
  rows?: TranslationMemoryUnitRow[];
}): TranslationMemoryMatchRecord[] {
  const matches: TranslationMemoryMatchRecord[] = [];
  for (const row of input.rows ?? []) {
    const version =
      typeof row.ofKeyVersion === 'object' ? row.ofKeyVersion : undefined;
    const unitId = iri(row.id);
    const keyVersionId = iri(row.ofKeyVersion);
    const candidateKey = row.ofKey?.key;
    if (
      !unitId ||
      !keyVersionId ||
      keyVersionId === input.currentVersion.id ||
      !candidateKey ||
      row.language !== input.language ||
      row.state !== 'reviewed' ||
      !row.text?.trim() ||
      !version?.contractHash ||
      version.contractHash !== input.currentVersion.contractHash
    ) {
      continue;
    }
    const exact = version.sourceHash === input.currentVersion.sourceHash;
    if (!exact && candidateKey !== input.key) continue;
    matches.push({
      unitId,
      key: candidateKey,
      language: input.language,
      text: row.text,
      keyVersionId,
      sourceText: version.sourceText ?? '',
      sourceHash: version.sourceHash ?? '',
      contractHash: version.contractHash,
      kind: exact ? 'exact' : 'carry-forward',
      updatedAt: isoDate(row.updatedAt) || undefined,
    });
  }
  return matches.sort(
    (left, right) =>
      (left.kind === right.kind ? 0 : left.kind === 'exact' ? -1 : 1) ||
      (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '') ||
      left.key.localeCompare(right.key),
  );
}

/** Build the reviewed-unit index shown in the explicit TM browser. */
export function toTranslationMemoryRecords(
  rows: TranslationMemoryUnitRow[] = [],
): TranslationMemoryRecord[] {
  return rows
    .flatMap((row): TranslationMemoryRecord[] => {
      const version =
        typeof row.ofKeyVersion === 'object' ? row.ofKeyVersion : undefined;
      const unitId = iri(row.id);
      const keyVersionId = iri(row.ofKeyVersion);
      const key = row.ofKey?.key;
      if (
        !unitId ||
        !keyVersionId ||
        !key ||
        !row.language ||
        row.state !== 'reviewed' ||
        !row.text?.trim() ||
        !version?.sourceHash ||
        !version.contractHash
      ) {
        return [];
      }
      return [
        {
          unitId,
          key,
          language: row.language,
          text: row.text,
          keyVersionId,
          sourceText: version.sourceText ?? '',
          sourceHash: version.sourceHash,
          contractHash: version.contractHash,
          updatedAt: isoDate(row.updatedAt) || undefined,
        },
      ];
    })
    .sort(
      (left, right) =>
        (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '') ||
        left.language.localeCompare(right.language) ||
        left.key.localeCompare(right.key),
    );
}

/**
 * Find current untranslated cells that can be filled without MT cost.
 * Source AND argument-contract hashes must match; the current version can
 * never source itself.
 */
export function findExactMemoryPretranslations(input: {
  entries: TranslationEntryRecord[];
  memory: TranslationMemoryRecord[];
  language: string;
}): TranslationMemoryPretranslateCandidate[] {
  const byContract = new Map<string, TranslationMemoryRecord[]>();
  for (const record of input.memory) {
    if (record.language !== input.language) continue;
    const signature = `${record.sourceHash}\u0000${record.contractHash}`;
    const candidates = byContract.get(signature) ?? [];
    candidates.push(record);
    byContract.set(signature, candidates);
  }
  for (const candidates of byContract.values()) {
    candidates.sort(
      (left, right) =>
        (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '') ||
        left.key.localeCompare(right.key),
    );
  }

  return input.entries.flatMap((entry) => {
    const current = entry.currentVersion;
    const unit = entry.units[input.language];
    if (
      !current?.sourceHash ||
      !current.contractHash ||
      unit?.text.trim()
    ) {
      return [];
    }
    const signature = `${current.sourceHash}\u0000${current.contractHash}`;
    const match = byContract
      .get(signature)
      ?.find((candidate) => candidate.keyVersionId !== current.id);
    return match
      ? [
          {
            key: entry.key,
            language: input.language,
            unitId: match.unitId,
            sourceKey: match.key,
            text: match.text,
          },
        ]
      : [];
  });
}

const TRANSLATION_STATES = new Set<TranslationState>([
  'untranslated',
  'machine',
  'reviewed',
  'stale',
]);

function normalizeState(value: unknown): TranslationState {
  return TRANSLATION_STATES.has(value as TranslationState)
    ? (value as TranslationState)
    : 'untranslated';
}

/**
 * Convert LINKED query rows into a deterministic, serialization-safe editor
 * contract. Exported for package-unit testing; it performs no I/O.
 */
export function groupTranslationEntries(
  keyRows: TranslationKeyRow[] = [],
  unitRows: TranslationUnitRow[] = [],
  versionRows: TranslationKeyVersionRow[] = [],
): TranslationEntryRecord[] {
  const entries = new Map<string, TranslationEntryRecord>();
  const currentVersionByKey = new Map<string, string>();

  for (const row of keyRows ?? []) {
    if (!row?.key) continue;
    const currentVersionId = iri((row as any).currentVersion);
    if (currentVersionId) currentVersionByKey.set(row.key, currentVersionId);
    entries.set(row.key, {
      key: row.key,
      namespace: row.namespace ?? '',
      sourceText: row.sourceText ?? '',
      description: row.description || undefined,
      kind: row.kind === 'content' ? 'content' : 'ui',
      format: row.format === 'icu' ? 'icu' : 'simple',
      ofShape: iri(row.ofShape),
      ofProperty: iri(row.ofProperty),
      fromPackage: row.fromPackage || undefined,
      overridden:
        (row as any).overridden === true || (row as any).overridden === 'true'
          ? true
          : undefined,
      versions: [],
      units: {},
    });
  }

  for (const row of versionRows ?? []) {
    const key = row?.ofKey?.key;
    const entry = key ? entries.get(key) : undefined;
    const version = toKeyVersionRecord(row);
    if (!entry || !version) continue;
    entry.versions!.push(version);
    if (currentVersionByKey.get(key!) === version.id) {
      entry.currentVersion = version;
    }
  }
  for (const entry of entries.values()) {
    entry.versions?.sort(
      (left, right) =>
        (right.createdAt ?? '').localeCompare(left.createdAt ?? '') ||
        right.versionId.localeCompare(left.versionId),
    );
    if (!entry.versions?.length) delete entry.versions;
  }

  const unitCandidates = new Map<
    string,
    { score: number; record: TranslationUnitRecord }
  >();
  for (const row of unitRows ?? []) {
    const key = row?.ofKey?.key;
    const language = row?.language;
    const entry = key ? entries.get(key) : undefined;
    if (!entry || !language) continue;
    const keyVersionId = iri(row.ofKeyVersion);
    const score =
      keyVersionId && keyVersionId === entry.currentVersion?.id
        ? 2
        : keyVersionId
          ? 1
          : 0;
    const candidateKey = `${key}\u0000${language}`;
    if ((unitCandidates.get(candidateKey)?.score ?? -1) >= score) continue;
    unitCandidates.set(candidateKey, {
      score,
      record: {
        language,
        text: row.text ?? '',
        state:
          entry.currentVersion && score < 2
            ? 'stale'
            : normalizeState(row.state),
        origin: row.origin || undefined,
        updatedAt: isoDate(row.updatedAt) || undefined,
        keyVersionId,
      },
    });
  }
  for (const [candidateKey, { record }] of unitCandidates) {
    const [key, language] = candidateKey.split('\u0000');
    const entry = entries.get(key);
    if (entry) entry.units[language] = record;
  }

  return [...entries.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** App-scoped key read shared by the RPC provider and managed key-sync flows. */
export async function listTranslationKeys(data: { appId: string }) {
  const appId = requireText(data.appId, 'appId');
  return TranslationKey.select((k) => [
    k.namespace,
    k.key,
    k.sourceText,
    k.description,
    k.kind,
    k.ofNode,
    k.ofField,
    k.ofShape,
    k.ofProperty,
    k.fromPackage,
    k.overridden,
    k.format,
    k.currentVersion,
  ]).where((k) => k.ofApplication.equals({ id: appId } as any));
}

/**
 * App-scoped keys + grouped language units as plain records — the read behind
 * the editor RPC AND the publish/compile flow (Plan 016 P2.3). No auth of its
 * own (the RPC wrapper gates); callers on the server run it in request context.
 */
export async function listTranslationEntries(data: {
  appId: string;
}): Promise<TranslationEntryRecord[]> {
  const appId = requireText(data.appId, 'appId');
  const [keys, units, versions] = await Promise.all([
    TranslationKey.select((k) => [
      k.namespace,
      k.key,
      k.sourceText,
      k.description,
      k.kind,
      k.format,
      k.ofShape,
      k.ofProperty,
      k.fromPackage,
      k.overridden,
      k.currentVersion,
    ]).where((k) => k.ofApplication.equals({ id: appId } as any)),
    TranslationUnit.select((u) => [
      u.language,
      u.text,
      u.state,
      u.origin,
      u.updatedAt,
      u.ofKeyVersion,
      u.ofKey.select((k) => [k.key]),
    ]).where((u) => u.ofKey.ofApplication.equals({ id: appId } as any)),
    TranslationKeyVersion.select((v) => [
      v.versionId,
      v.sourceLanguage,
      v.sourceText,
      v.format,
      v.argumentSignature,
      v.contractHash,
      v.sourceHash,
      v.supersedes,
      v.createdAt,
      v.createdBy,
      v.ofKey.select((k) => [k.key]),
    ]).where((v) => v.ofApplication.equals({ id: appId } as any)),
  ]);
  return groupTranslationEntries(keys as any, units as any, versions as any);
}

export async function listTranslationKeyVersions(data: {
  appId: string;
  key?: string;
}): Promise<TranslationKeyVersionRecord[]> {
  const appId = requireText(data.appId, 'appId');
  const keyId = data.key
    ? keyIri(appId, requireText(data.key, 'key'))
    : undefined;
  const query = TranslationKeyVersion.select((v) => [
    v.versionId,
    v.sourceLanguage,
    v.sourceText,
    v.format,
    v.argumentSignature,
    v.contractHash,
    v.sourceHash,
    v.supersedes,
    v.createdAt,
    v.createdBy,
  ]).where((v) =>
    keyId
      ? v.ofApplication
          .equals({ id: appId } as any)
          .and(v.ofKey.equals({ id: keyId } as any))
      : v.ofApplication.equals({ id: appId } as any),
  );
  const rows = await query;
  return (rows ?? [])
    .map((row: any) => toKeyVersionRecord(row))
    .filter(
      (record): record is TranslationKeyVersionRecord => record !== null,
    )
    .sort(
      (left, right) =>
        (right.createdAt ?? '').localeCompare(left.createdAt ?? '') ||
        right.versionId.localeCompare(left.versionId),
    );
}

function toReleaseRecord(row: any): TranslationReleaseRecord | null {
  const id = iri(row?.id) ?? iri(row);
  const appId = iri(row?.ofApplication);
  const branchId = iri(row?.branch);
  if (!id || !appId || !branchId || !row?.releaseId) return null;
  return {
    id,
    releaseId: row.releaseId,
    appId,
    branchId,
    buildId: row.buildId || undefined,
    channel: row.channel === 'production' ? 'production' : 'preview',
    status: ['published', 'superseded', 'retired'].includes(row.status)
      ? row.status
      : 'draft',
    contractSetHash: row.contractSetHash || '',
    manifestHash: row.manifestHash || '',
    hotfixSequence: Number(row.hotfixSequence ?? 0),
    qualitySummary: row.qualitySummary || undefined,
    createdAt: isoDate(row.createdAt) || '',
    publishedAt: isoDate(row.publishedAt) || undefined,
    supportedUntil: isoDate(row.supportedUntil) || undefined,
    supersedes: iri(row.supersedes),
  };
}

export async function listTranslationReleases(data: {
  appId: string;
}): Promise<TranslationReleaseRecord[]> {
  const appId = requireText(data.appId, 'appId');
  const rows = await TranslationRelease.select((release) => [
    release.releaseId,
    release.ofApplication,
    release.branch,
    release.buildId,
    release.channel,
    release.status,
    release.contractSetHash,
    release.manifestHash,
    release.hotfixSequence,
    release.qualitySummary,
    release.createdAt,
    release.publishedAt,
    release.supportedUntil,
    release.supersedes,
  ]).where((release) =>
    release.ofApplication.equals({ id: appId } as any),
  );
  return (rows ?? [])
    .map(toReleaseRecord)
    .filter((record): record is TranslationReleaseRecord => record !== null)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function createTranslationRelease(
  data: Omit<TranslationReleaseRecord, 'id' | 'createdAt'> & {
    createdAt?: string;
  },
): Promise<TranslationReleaseRecord> {
  const appId = requireText(data.appId, 'appId');
  const releaseId = requireText(data.releaseId, 'releaseId');
  const branchId = requireText(data.branchId, 'branchId');
  if (!['preview', 'production'].includes(data.channel)) {
    throw new Error('channel must be preview or production.');
  }
  if (!['draft', 'published', 'superseded', 'retired'].includes(data.status)) {
    throw new Error('Invalid translation release status.');
  }
  const id = `${appId.replace(/\/$/, '')}/translation/release/${encodeURIComponent(releaseId)}`;
  const existing = await TranslationRelease.select((release) => [
    release.releaseId,
  ])
    .where((release) => release.equals({ id } as any))
    .one()
    .catch(() => null);
  if (existing) {
    throw new Error(`Translation release "${releaseId}" already exists.`);
  }
  const createdAt = data.createdAt || new Date().toISOString();
  await TranslationRelease.create({
    __id: id,
    ofApplication: { id: appId },
    branch: { id: branchId },
    releaseId,
    buildId: data.buildId,
    channel: data.channel,
    status: data.status,
    contractSetHash: requireText(data.contractSetHash, 'contractSetHash'),
    manifestHash: requireText(data.manifestHash, 'manifestHash'),
    hotfixSequence: data.hotfixSequence,
    qualitySummary: data.qualitySummary,
    createdAt: new Date(createdAt),
    publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
    supportedUntil: data.supportedUntil ? new Date(data.supportedUntil) : undefined,
    supersedes: data.supersedes ? { id: data.supersedes } : undefined,
  } as any);
  return { ...data, id, createdAt };
}

export async function advanceTranslationReleaseHotfix(data: {
  id: string;
  expectedSequence: number;
  hotfixSequence: number;
  manifestHash: string;
}): Promise<TranslationReleaseRecord> {
  const id = requireText(data.id, 'id');
  const current = await TranslationRelease.select((release) => [
    release.releaseId,
    release.ofApplication,
    release.branch,
    release.buildId,
    release.channel,
    release.status,
    release.contractSetHash,
    release.manifestHash,
    release.hotfixSequence,
    release.qualitySummary,
    release.createdAt,
    release.publishedAt,
    release.supportedUntil,
    release.supersedes,
  ])
    .where((release) => release.equals({ id } as any))
    .one()
    .catch(() => null);
  const record = current ? toReleaseRecord(current) : null;
  if (!record) throw new Error(`Translation release "${id}" was not found.`);
  if (record.hotfixSequence !== data.expectedSequence) {
    throw new Error(
      `Translation release advanced from sequence ${data.expectedSequence} to ${record.hotfixSequence}.`,
    );
  }
  await TranslationRelease.update({
    hotfixSequence: data.hotfixSequence,
    manifestHash: requireText(data.manifestHash, 'manifestHash'),
  } as any).for({ id } as any);
  return {
    ...record,
    hotfixSequence: data.hotfixSequence,
    manifestHash: data.manifestHash,
  };
}

function requireText(value: string, label: string): string {
  const clean = value?.trim();
  if (!clean) throw new Error(`${label} is required.`);
  return clean;
}

function keyIri(appId: string, key: string): string {
  return `${appId.replace(/\/$/, '')}/translation/key/${encodeURIComponent(key)}`;
}

function versionIri(keyId: string, versionId: string): string {
  return `${keyId.replace(/\/$/, '')}/version/${versionId}`;
}

function unitIri(keyVersionId: string, language: string): string {
  return `${keyVersionId.replace(/\/$/, '')}/unit/${encodeURIComponent(language)}`;
}

/** Unique append-only revision IRI under the version-scoped cell it revises. */
function revisionIri(keyVersionId: string, language: string): string {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${unitIri(keyVersionId, language)}/rev/${suffix}`;
}

async function readKeyVersion(
  id: string,
): Promise<TranslationKeyVersionRecord | null> {
  const row = await TranslationKeyVersion.select((v) => [
    v.versionId,
    v.sourceLanguage,
    v.sourceText,
    v.format,
    v.argumentSignature,
    v.contractHash,
    v.sourceHash,
    v.supersedes,
    v.createdAt,
    v.createdBy,
  ])
    .where((v) => v.equals({ id } as any))
    .one()
    .catch(() => null);
  return row ? toKeyVersionRecord(row as any) : null;
}

async function createTranslationKeyVersion(input: {
  appId: string;
  keyId: string;
  sourceLanguage: string;
  sourceText: string;
  format: 'simple' | 'icu';
  supersedes?: string;
  createdBy?: string;
  backfill?: boolean;
}): Promise<TranslationKeyVersionRecord> {
  const derived = input.backfill
    ? await deriveBackfillKeyVersion(input)
    : {
        ...(await deriveTranslationKeyVersionContract(input)),
        versionId: createMonotonicVersionId(),
      };
  const id = versionIri(input.keyId, derived.versionId);
  const createdAt = new Date().toISOString();
  await TranslationKeyVersion.create({
    __id: id,
    ofApplication: { id: input.appId },
    ofKey: { id: input.keyId },
    versionId: derived.versionId,
    sourceLanguage: derived.sourceLanguage,
    sourceText: derived.sourceText,
    format: derived.format,
    argumentSignature: derived.argumentSignature,
    contractHash: derived.contractHash,
    sourceHash: derived.sourceHash,
    supersedes: input.supersedes ? { id: input.supersedes } : undefined,
    createdAt: new Date(createdAt),
    createdBy: input.createdBy ? { id: input.createdBy } : undefined,
  } as any);
  return {
    id,
    ...derived,
    supersedes: input.supersedes,
    createdAt,
    createdBy: input.createdBy,
  };
}

async function ensureCurrentKeyVersion(input: {
  appId: string;
  keyId: string;
  currentVersion?: unknown;
  sourceLanguage: string;
  sourceText: string;
  format: 'simple' | 'icu';
  createdBy?: string;
}): Promise<TranslationKeyVersionRecord> {
  const currentId = iri(input.currentVersion);
  if (currentId) {
    const current = await readKeyVersion(currentId);
    if (current) return current;
  }
  const initial = await createTranslationKeyVersion({
    ...input,
    backfill: true,
  });
  await TranslationKey.update({
    currentVersion: { id: initial.id },
  } as any).for({ id: input.keyId } as any);
  return initial;
}

const REVISION_STATUSES = new Set<TranslationRevisionStatus>([
  'applied',
  'proposed',
  'suggested',
  'accepted',
  'rejected',
  'superseded',
]);

async function requireKeyWriteContext(input: {
  appId: string;
  key: string;
  createdBy?: string;
}): Promise<{ keyId: string; version: TranslationKeyVersionRecord }> {
  const keyId = keyIri(input.appId, input.key);
  const keyRow = await TranslationKey.select((k) => [
    k.sourceText,
    k.format,
    k.currentVersion,
  ])
    .where((k) => k.equals({ id: keyId } as any))
    .one()
    .catch(() => null);
  if (!keyRow) {
    throw new Error(
      `Translation key "${input.key}" does not exist for this app.`,
    );
  }
  const version = await ensureCurrentKeyVersion({
    appId: input.appId,
    keyId,
    currentVersion: (keyRow as any).currentVersion,
    sourceLanguage: 'en',
    sourceText: (keyRow as any).sourceText ?? '',
    format: (keyRow as any).format === 'icu' ? 'icu' : 'simple',
    createdBy: input.createdBy,
  });
  return { keyId, version };
}

/**
 * Convert LINKED revision rows into plain RPC-safe records, newest first.
 * Exported for package-unit testing; performs no I/O.
 */
export function toRevisionRecords(
  rows: Array<Record<string, unknown>> = [],
): TranslationRevisionRecord[] {
  const iri = (value: unknown): string | undefined =>
    typeof value === 'string'
      ? value
      : (value as { id?: string } | undefined)?.id;
  return rows
    .filter((row) => typeof (row as any)?.text === 'string')
    .map((row: any): TranslationRevisionRecord => ({
      id: iri(row.id) ?? iri(row) ?? '',
      key: row.ofKey?.key ?? '',
      language: row.language ?? '',
      text: row.text ?? '',
      status: REVISION_STATUSES.has(row.status)
        ? (row.status as TranslationRevisionStatus)
        : 'applied',
      author: iri(row.author),
      authorKind: row.authorKind === 'machine' ? 'machine' : 'human',
      mtProvider: row.mtProvider || undefined,
      basedOnText: typeof row.basedOnText === 'string' ? row.basedOnText : undefined,
      note: row.note || undefined,
      createdAt: isoDate(row.createdAt) || undefined,
      decidedAt: isoDate(row.decidedAt) || undefined,
      decidedBy: iri(row.decidedBy),
      keyVersionId: iri(row.ofKeyVersion),
    }))
    .sort(
      (a, b) =>
        (b.createdAt ?? '').localeCompare(a.createdAt ?? '') ||
        b.id.localeCompare(a.id),
    );
}

export async function getTranslationRevision(data: {
  appId: string;
  revisionId: string;
}): Promise<TranslationRevisionRecord | null> {
  const appId = requireText(data.appId, 'appId');
  const revisionId = requireText(data.revisionId, 'revisionId');
  const row = await TranslationRevision.select((revision) => [
    revision.language,
    revision.text,
    revision.status,
    revision.author,
    revision.authorKind,
    revision.mtProvider,
    revision.basedOnText,
    revision.note,
    revision.createdAt,
    revision.decidedAt,
    revision.decidedBy,
    revision.ofKeyVersion,
    revision.ofKey.select((key) => [key.key]),
  ])
    .where((revision) =>
      revision
        .equals({ id: revisionId } as any)
        .and(revision.ofApplication.equals({ id: appId } as any)),
    )
    .one()
    .catch(() => null);
  return row ? toRevisionRecords([row as any])[0] ?? null : null;
}

/** Pending human proposals for the app, optionally narrowed to one language. */
export async function listTranslationProposals(data: {
  appId: string;
  language?: string;
}): Promise<TranslationRevisionRecord[]> {
  const appId = requireText(data.appId, 'appId');
  const language = data.language?.trim();
  const rows = await TranslationRevision.select((revision) => [
    revision.language,
    revision.text,
    revision.status,
    revision.author,
    revision.authorKind,
    revision.basedOnText,
    revision.note,
    revision.createdAt,
    revision.ofKeyVersion,
    revision.ofKey.select((key) => [key.key]),
  ]).where((revision) => {
    const base = revision.ofApplication
      .equals({ id: appId } as any)
      .and(revision.status.equals('proposed'));
    return language ? base.and(revision.language.equals(language)) : base;
  });
  const proposals = toRevisionRecords(rows as any);
  const entries = await listTranslationEntries({ appId });
  const current = new Map(
    entries.flatMap((entry) =>
      Object.entries(entry.units).map(([unitLanguage, unit]) => [
        `${entry.key}\u0000${unitLanguage}`,
        unit.text,
      ]),
    ),
  );
  return proposals.map((proposal) => {
    const currentText = current.get(`${proposal.key}\u0000${proposal.language}`) ?? '';
    return {
      ...proposal,
      currentText,
      conflicted: (proposal.basedOnText ?? '') !== currentText,
    };
  });
}

export async function decideTranslationProposal(
  data: {
    appId: string;
    revisionId: string;
    decision: 'accept' | 'reject';
    note?: string;
  },
  reviewer?: string,
): Promise<TranslationProposalDecision> {
  const proposal = await getTranslationRevision({
    appId: data.appId,
    revisionId: data.revisionId,
  });
  if (!proposal || proposal.status !== 'proposed') {
    throw new Error('This translation proposal is no longer pending.');
  }
  const decisionNote = data.note?.trim();
  if (data.decision === 'reject' && !decisionNote) {
    throw new Error('A reviewer note is required when rejecting a proposal.');
  }
  const now = new Date().toISOString();
  let unit: TranslationUnitRecord | undefined;
  if (data.decision === 'accept') {
    const currentEntries = await listTranslationEntries({ appId: data.appId });
    const currentText =
      currentEntries.find(({ key }) => key === proposal.key)?.units[
        proposal.language
      ]?.text ?? '';
    if ((proposal.basedOnText ?? '') !== currentText) {
      throw new Error(
        'This proposal conflicts with a newer translation. Review it again before accepting.',
      );
    }
    await upsertTranslationUnit(
      {
        appId: data.appId,
        key: proposal.key,
        language: proposal.language,
        text: proposal.text,
        state: 'reviewed',
      },
      {
        author: reviewer,
        authorKind: 'human',
        note: data.note || `Accepted proposal ${proposal.id}.`,
      },
    );
    unit = {
      language: proposal.language,
      text: proposal.text,
      state: 'reviewed',
      updatedAt: now,
    };
    const competing = await listTranslationProposals({
      appId: data.appId,
      language: proposal.language,
    });
    await Promise.all(
      competing
        .filter(
          ({ id, key }) => id !== proposal.id && key === proposal.key,
        )
        .map((revision) =>
          TranslationRevision.update({
            status: 'superseded',
            note: `Superseded by accepted proposal ${proposal.id}.`,
            decidedAt: new Date(now),
            decidedBy: reviewer ? { id: reviewer } : undefined,
          } as any).for({ id: revision.id } as any),
        ),
    );
  }
  await TranslationRevision.update({
    status: data.decision === 'accept' ? 'accepted' : 'rejected',
    note: decisionNote || proposal.note,
    decidedAt: new Date(now),
    decidedBy: reviewer ? { id: reviewer } : undefined,
  } as any).for({ id: proposal.id } as any);
  return {
    revision: {
      ...proposal,
      status: data.decision === 'accept' ? 'accepted' : 'rejected',
      note: decisionNote || proposal.note,
      decidedAt: now,
      decidedBy: reviewer,
      conflicted: false,
      currentText: unit?.text ?? proposal.currentText,
    },
    unit,
  };
}

/**
 * Idempotent key write shared by the RPC provider and managed key-sync flows.
 * Source drift marks every existing language unit stale before returning.
 */
export async function upsertTranslationKey(
  data: TranslationKeyInput,
  authorship: { createdBy?: string } = {},
): Promise<{ id: string; versionId: string; versionCreated: boolean }> {
  const appId = requireText(data.appId, 'appId');
  const key = requireText(data.key, 'key');
  requireText(data.sourceText, 'sourceText');
  const id = keyIri(appId, key);
  const values = {
    namespace: data.namespace ?? key.split('.').slice(0, -1).join('.'),
    key,
    sourceText: data.sourceText,
    description: data.description,
    kind: data.kind ?? 'ui',
    ofApplication: { id: appId },
    ofNode: data.ofNode ? { id: data.ofNode } : undefined,
    ofField: data.ofField,
    ofShape: data.ofShape ? { id: data.ofShape } : undefined,
    ofProperty: data.ofProperty ? { id: data.ofProperty } : undefined,
    fromPackage: data.fromPackage,
    overridden: data.overridden === true ? true : undefined,
    format: data.format ?? 'simple',
  } as any;
  const existing = await TranslationKey.select((k) => [
    k.sourceText,
    k.format,
    k.ofShape,
    k.overridden,
    k.currentVersion,
  ])
    .where((k) => k.equals({ id } as any))
    .one()
    .catch(() => null);
  if (existing) {
    const sourceChanged = (existing as any).sourceText !== data.sourceText;
    const wasOverridden = (existing as any).overridden === true;
    // AD-N override rule: editing the source of a SHAPE-owned key through the
    // per-app path (this write) marks the app copy `overridden`, so shape-route
    // propagation won't clobber the app's local wording. An explicit
    // `data.overridden` (e.g. the installer clearing it) always wins.
    const isShapeKey = !!(existing as any).ofShape || !!data.ofShape;
    if (data.overridden === undefined && isShapeKey && sourceChanged) {
      values.overridden = true;
      // Snapshot the canonical at FIRST divergence so "clear override" has a
      // value to revert to even for a single-app project. Later edits keep the
      // original snapshot (don't re-capture the already-overridden wording).
      if (!wasOverridden) values.shapeSource = (existing as any).sourceText;
    }
    const currentVersion = await ensureCurrentKeyVersion({
      appId,
      keyId: id,
      currentVersion: (existing as any).currentVersion,
      sourceLanguage: data.sourceLanguage ?? 'en',
      sourceText: (existing as any).sourceText ?? '',
      format: (existing as any).format === 'icu' ? 'icu' : 'simple',
      createdBy: authorship.createdBy,
    });
    const decision = classifyKeyVersion(currentVersion, {
      sourceText: data.sourceText,
      format: data.format ?? 'simple',
    });
    const nextVersion =
      decision.action === 'create-version'
        ? await createTranslationKeyVersion({
            appId,
            keyId: id,
            sourceLanguage:
              data.sourceLanguage ?? currentVersion.sourceLanguage ?? 'en',
            sourceText: data.sourceText,
            format: data.format ?? 'simple',
            supersedes: currentVersion.id,
            createdBy: authorship.createdBy,
          })
        : currentVersion;
    values.currentVersion = { id: nextVersion.id };
    await TranslationKey.update(values).for({ id } as any);
    if (decision.action === 'create-version') {
      await TranslationUnit.update({ state: 'stale' } as any).where((u) =>
        u.ofKey.equals({ id } as any),
      );
    }
    return {
      id,
      versionId: nextVersion.id,
      versionCreated: decision.action === 'create-version',
    };
  }
  await TranslationKey.create({ __id: id, ...values });
  const firstVersion = await createTranslationKeyVersion({
    appId,
    keyId: id,
    sourceLanguage: data.sourceLanguage ?? 'en',
    sourceText: data.sourceText,
    format: data.format ?? 'simple',
    createdBy: authorship.createdBy,
  });
  await TranslationKey.update({
    currentVersion: { id: firstVersion.id },
  } as any).for({ id } as any);
  return { id, versionId: firstVersion.id, versionCreated: true };
}

/**
 * Append one revision WITHOUT touching the unit (Plan 017 AD-P) — the write
 * path for MT SUGGESTIONS (Slice B) and translator PROPOSALS (Slice C): a
 * pending value a reviewer/editor applies later. `basedOnText` should carry
 * the unit text visible to the author, for conflict detection at decision time.
 */
export async function createTranslationRevision(data: {
  appId: string;
  key: string;
  language: string;
  text: string;
  status: TranslationRevisionStatus;
  author?: string;
  authorKind?: 'human' | 'machine';
  mtProvider?: string;
  basedOnText?: string;
  note?: string;
}): Promise<{ id: string }> {
  const appId = requireText(data.appId, 'appId');
  const key = requireText(data.key, 'key');
  const language = requireText(data.language, 'language');
  const { keyId, version } = await requireKeyWriteContext({
    appId,
    key,
    createdBy: data.author,
  });
  const id = revisionIri(version.id, language);
  await TranslationRevision.create({
    __id: id,
    ofApplication: { id: appId },
    ofKey: { id: keyId },
    ofKeyVersion: { id: version.id },
    language,
    text: data.text,
    status: data.status,
    author: data.author ? { id: data.author } : undefined,
    authorKind: data.authorKind ?? 'human',
    mtProvider: data.mtProvider,
    basedOnText: data.basedOnText,
    note: data.note,
    createdAt: new Date(),
  } as any);
  return { id };
}

/**
 * Idempotent unit write shared by the RPC provider, import, and (P4) MT flows.
 * Every write that CHANGES the text also records an append-only
 * `status:'applied'` `TranslationRevision` (Plan 017 AD-P) carrying the
 * previous text as `basedOnText` — the audit trail behind the history UI.
 * Re-saving identical text updates state/provenance without a revision.
 */
export async function upsertTranslationUnit(
  data: TranslationUnitInput,
  authorship: TranslationAuthorship = {},
): Promise<{ id: string; revisionId?: string }> {
  const appId = requireText(data.appId, 'appId');
  const key = requireText(data.key, 'key');
  const language = requireText(data.language, 'language');
  const author = authorship.author ?? data.updatedBy;
  const { keyId, version } = await requireKeyWriteContext({
    appId,
    key,
    createdBy: author,
  });
  const now = new Date().toISOString();
  const values = {
    ofApplication: { id: appId },
    ofKey: { id: keyId },
    ofKeyVersion: { id: version.id },
    language,
    text: data.text,
    state: data.state ?? 'reviewed',
    updatedAt: new Date(now),
    updatedBy: author ? { id: author } : undefined,
    origin: authorship.mtProvider === 'tm' ? 'tm' : '',
  } as any;
  const existing = await TranslationUnit.select((u) => [u.text])
    .where((u) =>
      u.language
        .equals(language)
        .and(u.ofKeyVersion.equals({ id: version.id } as any)),
    )
    .one()
    .catch(() => null);
  const id =
    iri((existing as any)?.id) ?? unitIri(version.id, language);
  if (existing) await TranslationUnit.update(values).for({ id } as any);
  else await TranslationUnit.create({ __id: id, ...values });

  const previousText = (existing as any)?.text as string | undefined;
  if (existing && previousText === data.text) return { id };
  const revisionId = revisionIri(version.id, language);
  await TranslationRevision.create({
    __id: revisionId,
    ofApplication: { id: appId },
    ofKey: { id: keyId },
    ofKeyVersion: { id: version.id },
    language,
    text: data.text,
    status: 'applied',
    author: author ? { id: author } : undefined,
    authorKind: authorship.authorKind ?? 'human',
    mtProvider: authorship.mtProvider,
    basedOnText: previousText,
    note: authorship.note,
    createdAt: new Date(now),
  } as any);
  return { id, revisionId };
}

/** One app-scoped lookup powers both exact TM and same-key carry-forward. */
export async function listTranslationMemoryMatches(data: {
  appId: string;
  key: string;
  language: string;
}): Promise<TranslationMemoryMatchRecord[]> {
  const appId = requireText(data.appId, 'appId');
  const key = requireText(data.key, 'key');
  const language = requireText(data.language, 'language');
  const keyId = keyIri(appId, key);
  const keyRow = await TranslationKey.select((candidate) => [
    candidate.currentVersion,
  ])
    .where((candidate) => candidate.equals({ id: keyId } as any))
    .one()
    .catch(() => null);
  const currentVersionId = iri((keyRow as any)?.currentVersion);
  const currentVersion = currentVersionId
    ? await readKeyVersion(currentVersionId)
    : null;
  if (!currentVersion) return [];

  const rows = await TranslationUnit.select((unit) => [
    unit.language,
    unit.text,
    unit.state,
    unit.updatedAt,
    unit.ofKey.select((candidate) => [candidate.key]),
    unit.ofKeyVersion.select((version) => [
      version.sourceText,
      version.sourceHash,
      version.contractHash,
    ]),
  ]).where((unit) =>
    unit.ofApplication
      .equals({ id: appId } as any)
      .and(unit.language.equals(language))
      .and(unit.state.equals('reviewed')),
  );
  return classifyTranslationMemoryMatches({
    key,
    language,
    currentVersion,
    rows: rows as any,
  });
}

/** App-scoped reviewed-unit index for search, audit, and exact reuse. */
export async function listTranslationMemory(data: {
  appId: string;
}): Promise<TranslationMemoryRecord[]> {
  const appId = requireText(data.appId, 'appId');
  const rows = await TranslationUnit.select((unit) => [
    unit.language,
    unit.text,
    unit.state,
    unit.updatedAt,
    unit.ofKey.select((candidate) => [candidate.key]),
    unit.ofKeyVersion.select((version) => [
      version.sourceText,
      version.sourceHash,
      version.contractHash,
    ]),
  ]).where((unit) =>
    unit.ofApplication
      .equals({ id: appId } as any)
      .and(unit.state.equals('reviewed')),
  );
  return toTranslationMemoryRecords(rows as any);
}

/** Preview or apply every safe exact-match TM candidate for one language. */
export async function pretranslateFromMemory(
  data: {
    appId: string;
    language: string;
    dryRun?: boolean;
  },
  authorship: { author?: string } = {},
): Promise<TranslationMemoryPretranslateReport> {
  const appId = requireText(data.appId, 'appId');
  const language = requireText(data.language, 'language');
  const [entries, memory] = await Promise.all([
    listTranslationEntries({ appId }),
    listTranslationMemory({ appId }),
  ]);
  const candidates = findExactMemoryPretranslations({
    entries,
    memory,
    language,
  });
  if (!data.dryRun) {
    for (const candidate of candidates) {
      await upsertTranslationUnit(
        {
          appId,
          key: candidate.key,
          language,
          text: candidate.text,
          state: 'machine',
        },
        {
          author: authorship.author,
          authorKind: 'machine',
          mtProvider: 'tm',
          note: `Exact translation-memory match from ${candidate.sourceKey}.`,
        },
      );
    }
  }
  return {
    language,
    eligible: candidates.length,
    translated: data.dryRun ? 0 : candidates.length,
    candidates,
  };
}

/** App-data termbase read shared by Studio, MT, and publish quality gates. */
export async function listGlossaryTerms(data: {
  appId: string;
}): Promise<GlossaryTermRecord[]> {
  requireText(data.appId, 'appId');
  const rows = await GlossaryTerm.select((glossary) => [
    glossary.term,
    glossary.translation,
    glossary.language,
    glossary.description,
    glossary.termType,
    glossary.useInstead,
    glossary.caseSensitive,
  ]).catch(() => []);
  return (rows ?? [])
    .filter((row: any) => row?.term)
    .map((row: any) => ({
      id: typeof row.id === 'string' ? row.id : (row.id?.id ?? ''),
      term: row.term,
      termType:
        row.termType === 'keep' || row.termType === 'forbid' || row.termType === 'require'
          ? row.termType
          : 'prefer',
      translation: row.translation || undefined,
      useInstead: row.useInstead || undefined,
      language: row.language || undefined,
      caseSensitive:
        row.caseSensitive === true || row.caseSensitive === 'true'
          ? true
          : undefined,
      description: row.description || undefined,
    }))
    .sort(
      (left: GlossaryTermRecord, right: GlossaryTermRecord) =>
        left.term.localeCompare(right.term) ||
        (left.language ?? '').localeCompare(right.language ?? ''),
    );
}

/**
 * Apply a server-validated memory candidate. Exact matches retain `machine`
 * state and `tm` provenance; changed-source carry-forward is an explicit
 * reviewer action and becomes reviewed.
 */
export async function applyTranslationMemoryMatch(
  data: {
    appId: string;
    key: string;
    language: string;
    unitId: string;
  },
  authorship: { author?: string } = {},
): Promise<TranslationUnitRecord> {
  const unitId = requireText(data.unitId, 'unitId');
  const match = (
    await listTranslationMemoryMatches({
      appId: data.appId,
      key: data.key,
      language: data.language,
    })
  ).find((candidate) => candidate.unitId === unitId);
  if (!match) {
    throw new Error(
      'Translation-memory candidate is no longer compatible with this key version.',
    );
  }
  const state: TranslationState =
    match.kind === 'exact' ? 'machine' : 'reviewed';
  await upsertTranslationUnit(
    {
      appId: data.appId,
      key: data.key,
      language: data.language,
      text: match.text,
      state,
    },
    {
      author: authorship.author,
      authorKind: match.kind === 'exact' ? 'machine' : 'human',
      mtProvider: match.kind === 'exact' ? 'tm' : undefined,
      note:
        match.kind === 'exact'
          ? `Exact translation-memory match from ${match.key}.`
          : `Reviewed carry-forward from ${match.keyVersionId}.`,
    },
  );
  return {
    language: data.language,
    text: match.text,
    state,
    origin: match.kind === 'exact' ? 'tm' : undefined,
    updatedAt: new Date().toISOString(),
  };
}

/** Server boundary for app-scoped translation keys and language units. */
export class TranslationProvider extends ShapeProvider {
  public shape = TranslationKey;

  /**
   * Authoring gate. Reads `linkedAuth` off the request the LINKED server already
   * populates — framework-level, so this stays portable (no CN/create-now-js
   * import, AD-G). Anonymous callers can no longer read or write an app's
   * translation content via `/call`. Fine-grained "is translation enabled for
   * this app + is the caller a project member" gating is a Create Now concern and
   * is enforced additionally at the CN route layer (`isTranslationEnabledForApp`).
   * `getMessages` intentionally stays public — it is the app's runtime string
   * fetch, not an authoring surface.
   */
  private requireAuthor(): void {
    const account = (this as any).request?.linkedAuth?.userAccount;
    if (!account) {
      throw new Error('Authentication required to read or edit translations.');
    }
  }

  private async requireAccess(
    data: { appId: string; language?: string },
    action: TranslationAuthoringAction,
  ): Promise<void> {
    this.requireAuthor();
    const actorWebId = this.authorIri();
    if (
      !actorWebId ||
      !(await canAuthorTranslation({
        appId: data.appId,
        actorWebId,
        action,
        language: data.language,
      }))
    ) {
      throw new Error(`Translation ${action} permission required.`);
    }
  }

  async listKeys(data: { appId: string }) {
    this.requireAuthor();
    return listTranslationKeys(data);
  }

  async listEntries(data: { appId: string }): Promise<TranslationEntryRecord[]> {
    this.requireAuthor();
    return listTranslationEntries(data);
  }

  async listKeyVersions(data: {
    appId: string;
    key?: string;
  }): Promise<TranslationKeyVersionRecord[]> {
    this.requireAuthor();
    return listTranslationKeyVersions(data);
  }

  async listMemoryMatches(data: {
    appId: string;
    key: string;
    language: string;
  }): Promise<TranslationMemoryMatchRecord[]> {
    this.requireAuthor();
    return listTranslationMemoryMatches(data);
  }

  async proposeRevision(data: {
    appId: string;
    key: string;
    language: string;
    text: string;
    basedOnText?: string;
    note?: string;
  }): Promise<{ id: string }> {
    await this.requireAccess(data, 'propose');
    const currentEntries = await listTranslationEntries({ appId: data.appId });
    const basedOnText =
      currentEntries.find(({ key }) => key === data.key)?.units[data.language]
        ?.text ?? '';
    return createTranslationRevision({
      ...data,
      basedOnText,
      status: 'proposed',
      author: this.authorIri(),
      authorKind: 'human',
    });
  }

  async listProposals(data: {
    appId: string;
    language?: string;
  }): Promise<TranslationRevisionRecord[]> {
    this.requireAuthor();
    const actorWebId = this.authorIri();
    if (!actorWebId) throw new Error('Translation read permission required.');
    const proposals = await listTranslationProposals(data);
    const allowed = await Promise.all(
      proposals.map((proposal) =>
        canAuthorTranslation({
          appId: data.appId,
          actorWebId,
          action: 'read',
          language: proposal.language,
        }),
      ),
    );
    return proposals.filter((_, index) => allowed[index]);
  }

  async decideProposal(data: {
    appId: string;
    revisionId: string;
    decision: 'accept' | 'reject';
    note?: string;
  }): Promise<TranslationProposalDecision> {
    const proposal = await getTranslationRevision({
      appId: data.appId,
      revisionId: data.revisionId,
    });
    if (!proposal) {
      throw new Error('This translation proposal is no longer pending.');
    }
    await this.requireAccess(
      { appId: data.appId, language: proposal.language },
      'review',
    );
    return decideTranslationProposal(data, this.authorIri());
  }

  async listMemory(data: {
    appId: string;
  }): Promise<TranslationMemoryRecord[]> {
    this.requireAuthor();
    return listTranslationMemory(data);
  }

  async pretranslateMemory(data: {
    appId: string;
    language: string;
    dryRun?: boolean;
  }): Promise<TranslationMemoryPretranslateReport> {
    await this.requireAccess(data, 'run-mt');
    return pretranslateFromMemory(data, { author: this.authorIri() });
  }

  async applyMemoryMatch(data: {
    appId: string;
    key: string;
    language: string;
    unitId: string;
  }): Promise<TranslationUnitRecord> {
    await this.requireAccess(data, 'review');
    return applyTranslationMemoryMatch(data, { author: this.authorIri() });
  }

  async listReleases(data: {
    appId: string;
  }): Promise<TranslationReleaseRecord[]> {
    this.requireAuthor();
    return listTranslationReleases(data);
  }

  async createRelease(
    data: Omit<TranslationReleaseRecord, 'id' | 'createdAt'> & {
      createdAt?: string;
    },
  ): Promise<TranslationReleaseRecord> {
    this.requireAuthor();
    return createTranslationRelease(data);
  }

  async advanceReleaseHotfix(data: {
    id: string;
    expectedSequence: number;
    hotfixSequence: number;
    manifestHash: string;
  }): Promise<TranslationReleaseRecord> {
    this.requireAuthor();
    return advanceTranslationReleaseHotfix(data);
  }

  async upsertKey(data: TranslationKeyInput): Promise<{ id: string }> {
    this.requireAuthor();
    return upsertTranslationKey(data, { createdBy: this.authorIri() });
  }

  /** WebID of the signed-in caller — never trust a client-supplied author. */
  private authorIri(): string | undefined {
    const auth = (this as any).request?.linkedAuth;
    const webId =
      auth?.userAccount?.accountOf?.id ??
      auth?.webId ??
      auth?.userAccount?.id ??
      auth?.userAccount;
    return typeof webId === 'string' && webId ? webId : undefined;
  }

  async upsertUnit(data: TranslationUnitInput): Promise<{ id: string }> {
    await this.requireAccess(data, 'review');
    return upsertTranslationUnit(
      { ...data, updatedBy: undefined },
      { author: this.authorIri(), authorKind: 'human' },
    );
  }

  /**
   * Glossary CRUD (Plan 017 Slice B). App-data is branch-routed per app, so
   * every GlossaryTerm in context belongs to the calling app; the appId only
   * anchors the IRIs. Uniqueness = (term, language) — upsert is
   * delete-then-create on that identity.
   */
  async listGlossary(data: { appId: string }): Promise<GlossaryTermRecord[]> {
    this.requireAuthor();
    return listGlossaryTerms(data);
  }

  async upsertGlossaryTerm(data: {
    appId: string;
    term: string;
    termType?: 'prefer' | 'require' | 'keep' | 'forbid';
    translation?: string;
    useInstead?: string;
    language?: string;
    caseSensitive?: boolean;
    description?: string;
  }): Promise<{ id: string }> {
    await this.requireAccess(data, 'manage');
    const appId = requireText(data.appId, 'appId');
    const term = requireText(data.term, 'term');
    const language = data.language?.trim() || '';
    const termType =
      data.termType === 'keep' || data.termType === 'forbid' || data.termType === 'require'
        ? data.termType
        : 'prefer';
    if (termType === 'require' && !data.translation?.trim()) {
      throw new Error('A required glossary term needs a translation.');
    }
    const id = `${appId.replace(/\/$/, '')}/translation/glossary/${encodeURIComponent(
      term,
    )}--${encodeURIComponent(language || 'all')}`;
    // Delete-then-create: INSERT DATA is add-only, re-saving would duplicate.
    await (GlossaryTerm as any).delete({ id }).catch(() => {});
    await GlossaryTerm.create({
      __id: id,
      term,
      termType,
      translation:
        termType === 'prefer' || termType === 'require' ? data.translation?.trim() || undefined : undefined,
      useInstead:
        termType === 'forbid' ? data.useInstead?.trim() || undefined : undefined,
      language: language || undefined,
      caseSensitive: data.caseSensitive === true ? true : undefined,
      description: data.description?.trim() || undefined,
    } as any);
    return { id };
  }

  async deleteGlossaryTerm(data: { appId: string; id: string }): Promise<{ deleted: boolean }> {
    await this.requireAccess(data, 'manage');
    const appId = requireText(data.appId, 'appId');
    const id = requireText(data.id, 'id');
    // Only glossary nodes under this app's namespace may be deleted here.
    if (!id.startsWith(`${appId.replace(/\/$/, '')}/translation/glossary/`)) {
      throw new Error('Not a glossary entry of this app.');
    }
    await (GlossaryTerm as any).delete({ id });
    return { deleted: true };
  }

  /** History for one (key, language) cell — newest first (Plan 017 AD-P). */
  async listRevisions(data: {
    appId: string;
    key: string;
    language: string;
  }): Promise<TranslationRevisionRecord[]> {
    this.requireAuthor();
    const appId = requireText(data.appId, 'appId');
    const key = requireText(data.key, 'key');
    const language = requireText(data.language, 'language');
    const keyId = keyIri(appId, key);
    const rows = await TranslationRevision.select((r) => [
      r.language,
      r.text,
      r.status,
      r.author,
      r.authorKind,
      r.mtProvider,
      r.basedOnText,
      r.note,
      r.createdAt,
      r.decidedAt,
      r.decidedBy,
      r.ofKeyVersion,
      r.ofKey.select((k) => [k.key]),
    ]).where((r) =>
      r.language.equals(language).and(r.ofKey.equals({ id: keyId } as any)),
    );
    return toRevisionRecords(rows as any);
  }

  async getMessages(data: {
    appId: string;
    language: string;
  }): Promise<TranslationMessages> {
    const appId = requireText(data.appId, 'appId');
    const language = requireText(data.language, 'language');
    const rows = await TranslationUnit.select((u) => [
      u.text,
      u.ofKeyVersion,
      u.ofKey.select((k) => [k.key, k.format, k.currentVersion]),
    ]).where((u) =>
      u.language
        .equals(language)
        .and(u.ofKey.ofApplication.equals({ id: appId } as any)),
    );
    return Object.fromEntries(
      (rows ?? [])
        .filter((row: any) => {
          const currentVersion = iri(row.ofKey?.currentVersion);
          const unitVersion = iri(row.ofKeyVersion);
          return !currentVersion || currentVersion === unitVersion;
        })
        .map((row: any) => [
          row.ofKey?.key,
          row.ofKey?.format === 'icu'
            ? { message: row.text, format: 'icu' as const }
            : row.text,
        ] as const)
        .filter(([key]) => typeof key === 'string' && key.length > 0),
    );
  }
}
