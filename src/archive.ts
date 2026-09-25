import { zipSync, type Zippable } from 'fflate';

import { canonicalJson } from './release.js';
import {
  DEFAULT_TRANSLATION_JSON_ARCHIVE_LIMITS,
  safeUnzipTranslationZip,
  translationZipLimits,
  type TranslationJsonArchiveLimits,
} from './formats/json.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** Full backups include every language and its revision history. CAT-file
 * imports retain their smaller defaults; native backups remain bounded too. */
export const DEFAULT_TRANSLATION_ARCHIVE_LIMITS: TranslationJsonArchiveLimits =
  Object.freeze({
    ...DEFAULT_TRANSLATION_JSON_ARCHIVE_LIMITS,
    maxArchiveBytes: 64 * 1024 * 1024,
    maxEntryCompressedBytes: 32 * 1024 * 1024,
    maxEntryUncompressedBytes: 128 * 1024 * 1024,
    maxTotalUncompressedBytes: 256 * 1024 * 1024,
  });

export const TRANSLATION_ARCHIVE_MANIFEST_PATH =
  'linked.translation-archive.json';

/**
 * Archives written before 0.3.0 named the manifest — and the archive format
 * itself — after Create Now. Both spellings are read; only the current one is
 * written. The format id is inside `archiveContentHash`'s input, so a legacy
 * manifest keeps the value it was hashed with.
 */
export const LEGACY_TRANSLATION_ARCHIVE_MANIFEST_PATH =
  'create-now.translation-archive.json';

export const TRANSLATION_ARCHIVE_FORMAT = 'linked-translation-archive';
export const LEGACY_TRANSLATION_ARCHIVE_FORMAT = 'create-now-translation-archive';

export type TranslationArchiveCollection =
  | 'configuration'
  | 'keys'
  | 'keyVersions'
  | 'units'
  | 'glossary'
  | 'style'
  | 'revisions'
  | 'provenance'
  | 'content'
  | 'releases'
  | 'buildPins';

export const TRANSLATION_ARCHIVE_COLLECTIONS:
  readonly TranslationArchiveCollection[] = Object.freeze([
    'configuration',
    'keys',
    'keyVersions',
    'units',
    'glossary',
    'style',
    'revisions',
    'provenance',
    'content',
    'releases',
    'buildPins',
  ]);

export const TRANSLATION_ARCHIVE_EXCLUSIONS = Object.freeze([
  'provider secrets and API keys',
  'import/export sessions',
  'collaborators, assignments, and invitations',
  'workspace entitlements',
  'identity and authentication records',
  'unrelated application graph data',
]);

export type TranslationArchiveJson =
  | null
  | boolean
  | number
  | string
  | TranslationArchiveJson[]
  | { [key: string]: TranslationArchiveJson };

export interface TranslationArchiveEntityInput {
  id: string;
  data: Record<string, TranslationArchiveJson>;
}

export interface TranslationArchiveEntity extends TranslationArchiveEntityInput {
  contentHash: string;
}

export interface TranslationArchiveObjectInput {
  hash: string;
  body?: Uint8Array;
  mediaType?: string;
}

export interface TranslationArchiveSnapshot {
  appId: string;
  branchId: string;
  revisionWatermark: string;
  createdAt?: string;
  collections: Partial<
    Record<TranslationArchiveCollection, TranslationArchiveEntityInput[]>
  >;
  /** Immutable release catalog objects; omitted bodies remain references only. */
  objects?: TranslationArchiveObjectInput[];
}

export interface TranslationArchiveFileInventory {
  path: string;
  collection: TranslationArchiveCollection;
  hash: string;
  bytes: number;
  records: number;
}

export interface TranslationArchiveObjectInventory {
  path: string;
  hash: string;
  bytes?: number;
  mediaType?: string;
  included: boolean;
}

export interface TranslationArchiveManifest {
  schemaVersion: 1;
  format:
    | typeof TRANSLATION_ARCHIVE_FORMAT
    | typeof LEGACY_TRANSLATION_ARCHIVE_FORMAT;
  appId: string;
  branchId: string;
  revisionWatermark: string;
  createdAt?: string;
  files: TranslationArchiveFileInventory[];
  objects: TranslationArchiveObjectInventory[];
  exclusions: string[];
  archiveContentHash: string;
}

export interface SerializedTranslationArchive {
  fileName: string;
  mediaType: 'application/zip';
  body: Uint8Array;
  manifest: TranslationArchiveManifest;
}

export interface ParsedTranslationArchive {
  manifest: TranslationArchiveManifest;
  collections: Record<
    TranslationArchiveCollection,
    TranslationArchiveEntity[]
  >;
  objects: Array<{
    hash: string;
    body?: Uint8Array;
    mediaType?: string;
  }>;
}

export interface TranslationArchiveTargetRecord {
  id: string;
  contentHash: string;
}

export interface TranslationArchiveContentMapping {
  sourceNodeIri: string;
  sourceFieldIri: string;
  targetNodeIri: string;
  targetFieldIri: string;
}

export interface PlanTranslationArchiveRestoreOptions {
  mode: 'same-app' | 'cross-app';
  targetAppId: string;
  targetRecords?: TranslationArchiveTargetRecord[];
  contentMappings?: TranslationArchiveContentMapping[];
  targetRevisionWatermark?: string;
}

export interface TranslationArchiveRestoreDecision {
  collection: TranslationArchiveCollection;
  sourceId: string;
  targetId: string;
  action: 'create' | 'skip' | 'collision' | 'unmapped';
  expectedTargetContentHash?: string;
  record?: TranslationArchiveEntity;
  reason?: string;
  retryKey: string;
}

export interface TranslationArchiveRestorePlan {
  schemaVersion: 1;
  mode: 'same-app' | 'cross-app';
  sourceAppId: string;
  targetAppId: string;
  sourceBranchId: string;
  archiveContentHash: string;
  archiveRevisionWatermark: string;
  expectedTargetRevisionWatermark?: string;
  blocked: boolean;
  decisions: TranslationArchiveRestoreDecision[];
  iriMappings: Record<string, string>;
  creates: number;
  skips: number;
  collisions: number;
  unresolvedContent: number;
  historicalReleases: number;
  identityWrites: 0;
  assignmentWrites: 0;
}

const COLLECTION_PATHS: Record<TranslationArchiveCollection, string> = {
  configuration: 'content/configuration.json',
  keys: 'content/keys.json',
  keyVersions: 'content/key-versions.json',
  units: 'content/units.json',
  glossary: 'content/glossary.json',
  style: 'content/style.json',
  revisions: 'content/revisions.json',
  provenance: 'content/provenance.json',
  content: 'content/content-translations.json',
  releases: 'content/releases.json',
  buildPins: 'content/build-pins.json',
};

const FORBIDDEN_ARCHIVE_FIELDS = new Set([
  'apikey',
  'api_key',
  'secret',
  'clientsecret',
  'accesstoken',
  'refreshtoken',
  'password',
  'credential',
  'credentials',
  'session',
  'sessionid',
  'collaborator',
  'collaborators',
  'invite',
  'invites',
  'assignment',
  'assignments',
  'entitlement',
  'entitlements',
]);

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertArchiveSafeValue(value: unknown, path = 'data'): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} contains a non-finite number.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertArchiveSafeValue(item, `${path}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== 'object') {
    throw new Error(`${path} contains an unsupported value.`);
  }
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_ARCHIVE_FIELDS.has(key.toLowerCase())) {
      throw new Error(
        `Archive field "${path}.${key}" contains excluded security or control-plane data.`,
      );
    }
    assertArchiveSafeValue(item, `${path}.${key}`);
  }
}

function decodeJson(input: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(decoder.decode(input)) as unknown;
  } catch {
    throw new Error(`${label} must contain valid UTF-8 JSON.`);
  }
}

async function sha256Bytes(value: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    value as unknown as BufferSource,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function canonicalBytes(value: unknown): Uint8Array {
  return encoder.encode(canonicalJson(value));
}

function normalizeEntityInput(
  value: TranslationArchiveEntityInput,
  label: string,
): TranslationArchiveEntityInput {
  const id = requiredString(value?.id, `${label}.id`);
  const data = record(value?.data, `${label}.data`) as Record<
    string,
    TranslationArchiveJson
  >;
  assertArchiveSafeValue(data, `${label}.data`);
  return { id, data };
}

async function archiveEntity(
  value: TranslationArchiveEntityInput,
  label: string,
): Promise<TranslationArchiveEntity> {
  const normalized = normalizeEntityInput(value, label);
  return {
    ...normalized,
    contentHash: await sha256Bytes(canonicalBytes(normalized)),
  };
}

function archiveContentHashInput(
  manifest: Omit<TranslationArchiveManifest, 'archiveContentHash'>,
): unknown {
  return {
    schemaVersion: manifest.schemaVersion,
    format: manifest.format,
    appId: manifest.appId,
    branchId: manifest.branchId,
    revisionWatermark: manifest.revisionWatermark,
    ...(manifest.createdAt ? { createdAt: manifest.createdAt } : {}),
    files: manifest.files,
    objects: manifest.objects,
    exclusions: manifest.exclusions,
  };
}

function objectPath(hash: string): string {
  return `objects/catalog/${hash}.json`;
}

function normalizeHash(value: unknown, label: string): string {
  const hash = requiredString(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`${label} must be a SHA-256 hex digest.`);
  }
  return hash;
}

/** Create a deterministic, full-fidelity translation archive. */
export async function createTranslationArchive(
  snapshot: TranslationArchiveSnapshot,
  options: { limits?: Partial<TranslationJsonArchiveLimits> } = {},
): Promise<SerializedTranslationArchive> {
  const appId = requiredString(snapshot?.appId, 'snapshot.appId');
  const branchId = requiredString(snapshot?.branchId, 'snapshot.branchId');
  const revisionWatermark = requiredString(
    snapshot?.revisionWatermark,
    'snapshot.revisionWatermark',
  );
  const limits = translationZipLimits({
    ...DEFAULT_TRANSLATION_ARCHIVE_LIMITS,
    ...options.limits,
  });
  const files: Zippable = Object.create(null);
  const fileInventory: TranslationArchiveFileInventory[] = [];
  for (const collection of TRANSLATION_ARCHIVE_COLLECTIONS) {
    const values = snapshot.collections?.[collection] ?? [];
    const entities = await Promise.all(
      values.map((value, index) =>
        archiveEntity(value, `${collection}[${index}]`),
      ),
    );
    entities.sort((left, right) => left.id.localeCompare(right.id));
    const duplicate = entities.find(
      (entity, index) => index > 0 && entity.id === entities[index - 1].id,
    );
    if (duplicate) {
      throw new Error(
        `Archive collection "${collection}" contains duplicate id "${duplicate.id}".`,
      );
    }
    const path = COLLECTION_PATHS[collection];
    const body = canonicalBytes(entities);
    files[path] = body;
    fileInventory.push({
      path,
      collection,
      hash: await sha256Bytes(body),
      bytes: body.byteLength,
      records: entities.length,
    });
  }

  const objectInventory: TranslationArchiveObjectInventory[] = [];
  const seenObjects = new Set<string>();
  for (const [index, object] of [...(snapshot.objects ?? [])]
    .sort((left, right) => left.hash.localeCompare(right.hash))
    .entries()) {
    const hash = normalizeHash(object.hash, `objects[${index}].hash`);
    if (seenObjects.has(hash)) {
      throw new Error(`Archive contains duplicate object hash "${hash}".`);
    }
    seenObjects.add(hash);
    const path = objectPath(hash);
    if (object.body) {
      const actual = await sha256Bytes(object.body);
      if (actual !== hash) {
        throw new Error(
          `Archive object "${hash}" does not match its content hash.`,
        );
      }
      files[path] = object.body;
    }
    objectInventory.push({
      path,
      hash,
      included: Boolean(object.body),
      ...(object.body ? { bytes: object.body.byteLength } : {}),
      ...(object.mediaType ? { mediaType: object.mediaType } : {}),
    });
  }

  const unsignedManifest: Omit<
    TranslationArchiveManifest,
    'archiveContentHash'
  > = {
    schemaVersion: 1,
    format: TRANSLATION_ARCHIVE_FORMAT,
    appId,
    branchId,
    revisionWatermark,
    ...(snapshot.createdAt
      ? { createdAt: requiredString(snapshot.createdAt, 'snapshot.createdAt') }
      : {}),
    files: fileInventory,
    objects: objectInventory,
    exclusions: [...TRANSLATION_ARCHIVE_EXCLUSIONS],
  };
  const manifest: TranslationArchiveManifest = {
    ...unsignedManifest,
    archiveContentHash: await sha256Bytes(
      canonicalBytes(archiveContentHashInput(unsignedManifest)),
    ),
  };
  files[TRANSLATION_ARCHIVE_MANIFEST_PATH] = canonicalBytes(manifest);
  if (Object.keys(files).length > limits.maxEntries) {
    throw new Error('ZIP archive exceeds the entry-count limit.');
  }
  const body = zipSync(files, {
    level: 6,
    mtime: new Date('1980-01-01T00:00:00.000Z'),
  });
  safeUnzipTranslationZip(body, limits);
  return {
    fileName: 'linked-translations.backup.zip',
    mediaType: 'application/zip',
    body,
    manifest,
  };
}

function parseManifest(value: unknown): TranslationArchiveManifest {
  const raw = record(value, 'manifest');
  if (raw.schemaVersion !== 1) {
    throw new Error(
      `Unsupported translation archive schemaVersion "${String(raw.schemaVersion)}".`,
    );
  }
  if (
    raw.format !== TRANSLATION_ARCHIVE_FORMAT &&
    raw.format !== LEGACY_TRANSLATION_ARCHIVE_FORMAT
  ) {
    throw new Error('Unsupported translation archive format.');
  }
  if (!Array.isArray(raw.files) || !Array.isArray(raw.objects)) {
    throw new Error('Translation archive manifest inventory is invalid.');
  }
  if (
    !Array.isArray(raw.exclusions) ||
    raw.exclusions.some((item) => typeof item !== 'string')
  ) {
    throw new Error('Translation archive exclusions are invalid.');
  }
  const collectionSet = new Set(TRANSLATION_ARCHIVE_COLLECTIONS);
  const files = raw.files.map((value, index) => {
    const item = record(value, `manifest.files[${index}]`);
    const collection = item.collection as TranslationArchiveCollection;
    if (!collectionSet.has(collection)) {
      throw new Error(`manifest.files[${index}].collection is invalid.`);
    }
    if (item.path !== COLLECTION_PATHS[collection]) {
      throw new Error(`manifest.files[${index}].path is invalid.`);
    }
    if (
      !Number.isSafeInteger(item.bytes) ||
      (item.bytes as number) < 0 ||
      !Number.isSafeInteger(item.records) ||
      (item.records as number) < 0
    ) {
      throw new Error(`manifest.files[${index}] counts are invalid.`);
    }
    return {
      path: item.path as string,
      collection,
      hash: normalizeHash(item.hash, `manifest.files[${index}].hash`),
      bytes: item.bytes as number,
      records: item.records as number,
    };
  });
  const objects = raw.objects.map((value, index) => {
    const item = record(value, `manifest.objects[${index}]`);
    const hash = normalizeHash(item.hash, `manifest.objects[${index}].hash`);
    if (item.path !== objectPath(hash) || typeof item.included !== 'boolean') {
      throw new Error(`manifest.objects[${index}] is invalid.`);
    }
    if (
      item.bytes !== undefined &&
      (!Number.isSafeInteger(item.bytes) || (item.bytes as number) < 0)
    ) {
      throw new Error(`manifest.objects[${index}].bytes is invalid.`);
    }
    return {
      path: item.path as string,
      hash,
      included: item.included,
      ...(item.bytes === undefined ? {} : { bytes: item.bytes as number }),
      ...(item.mediaType === undefined
        ? {}
        : { mediaType: requiredString(item.mediaType, `manifest.objects[${index}].mediaType`) }),
    };
  });
  return {
    schemaVersion: 1,
    // Echoed back, not normalized: it is part of the content hash input.
    format: raw.format,
    appId: requiredString(raw.appId, 'manifest.appId'),
    branchId: requiredString(raw.branchId, 'manifest.branchId'),
    revisionWatermark: requiredString(
      raw.revisionWatermark,
      'manifest.revisionWatermark',
    ),
    ...(raw.createdAt === undefined
      ? {}
      : { createdAt: requiredString(raw.createdAt, 'manifest.createdAt') }),
    files,
    objects,
    exclusions: raw.exclusions as string[],
    archiveContentHash: normalizeHash(
      raw.archiveContentHash,
      'manifest.archiveContentHash',
    ),
  };
}

async function parseEntities(
  value: unknown,
  collection: TranslationArchiveCollection,
): Promise<TranslationArchiveEntity[]> {
  if (!Array.isArray(value)) {
    throw new Error(`Archive ${collection} file must contain an array.`);
  }
  const entities: TranslationArchiveEntity[] = [];
  const ids = new Set<string>();
  for (const [index, rawValue] of value.entries()) {
    const raw = record(rawValue, `${collection}[${index}]`);
    const normalized = normalizeEntityInput(
      {
        id: raw.id as string,
        data: raw.data as Record<string, TranslationArchiveJson>,
      },
      `${collection}[${index}]`,
    );
    const contentHash = normalizeHash(
      raw.contentHash,
      `${collection}[${index}].contentHash`,
    );
    const actual = await sha256Bytes(canonicalBytes(normalized));
    if (actual !== contentHash) {
      throw new Error(
        `Archive ${collection} record "${normalized.id}" has an invalid content hash.`,
      );
    }
    if (ids.has(normalized.id)) {
      throw new Error(
        `Archive collection "${collection}" contains duplicate id "${normalized.id}".`,
      );
    }
    ids.add(normalized.id);
    entities.push({ ...normalized, contentHash });
  }
  return entities.sort((left, right) => left.id.localeCompare(right.id));
}

/** Parse and verify every declared content file and optional catalog object. */
export async function parseTranslationArchive(
  input: Uint8Array,
  options: { limits?: Partial<TranslationJsonArchiveLimits> } = {},
): Promise<ParsedTranslationArchive> {
  const files = safeUnzipTranslationZip(input, {
    ...DEFAULT_TRANSLATION_ARCHIVE_LIMITS,
    ...options.limits,
  });
  const manifestPath =
    files[TRANSLATION_ARCHIVE_MANIFEST_PATH] !== undefined
      ? TRANSLATION_ARCHIVE_MANIFEST_PATH
      : LEGACY_TRANSLATION_ARCHIVE_MANIFEST_PATH;
  const manifestBody = files[manifestPath];
  if (!manifestBody) {
    throw new Error('Translation archive manifest is missing.');
  }
  const manifest = parseManifest(decodeJson(manifestBody, manifestPath));
  const actualArchiveHash = await sha256Bytes(
    canonicalBytes(
      archiveContentHashInput(
        manifest as Omit<TranslationArchiveManifest, 'archiveContentHash'>,
      ),
    ),
  );
  if (actualArchiveHash !== manifest.archiveContentHash) {
    throw new Error('Translation archive manifest content hash is invalid.');
  }

  const allowedPaths = new Set<string>([
    manifestPath,
    ...manifest.files.map(({ path }) => path),
    ...manifest.objects.filter(({ included }) => included).map(({ path }) => path),
  ]);
  const unexpected = Object.keys(files).find((path) => !allowedPaths.has(path));
  if (unexpected) {
    throw new Error(`Translation archive contains undeclared file "${unexpected}".`);
  }
  if (manifest.files.length !== TRANSLATION_ARCHIVE_COLLECTIONS.length) {
    throw new Error('Translation archive must inventory every content collection.');
  }

  const collections = Object.create(null) as Record<
    TranslationArchiveCollection,
    TranslationArchiveEntity[]
  >;
  for (const item of manifest.files) {
    const body = files[item.path];
    if (!body) throw new Error(`Translation archive is missing "${item.path}".`);
    if (
      body.byteLength !== item.bytes ||
      (await sha256Bytes(body)) !== item.hash
    ) {
      throw new Error(`Translation archive file "${item.path}" failed verification.`);
    }
    const entities = await parseEntities(
      decodeJson(body, item.path),
      item.collection,
    );
    if (entities.length !== item.records) {
      throw new Error(`Translation archive file "${item.path}" count is invalid.`);
    }
    collections[item.collection] = entities;
  }

  const objects = await Promise.all(
    manifest.objects.map(async (item) => {
      const body = files[item.path];
      if (item.included) {
        if (!body) {
          throw new Error(`Translation archive object "${item.hash}" is missing.`);
        }
        if (
          (item.bytes !== undefined && body.byteLength !== item.bytes) ||
          (await sha256Bytes(body)) !== item.hash
        ) {
          throw new Error(
            `Translation archive object "${item.hash}" failed verification.`,
          );
        }
      } else if (body) {
        throw new Error(
          `Translation archive reference-only object "${item.hash}" unexpectedly has a body.`,
        );
      }
      return {
        hash: item.hash,
        ...(body ? { body } : {}),
        ...(item.mediaType ? { mediaType: item.mediaType } : {}),
      };
    }),
  );
  return { manifest, collections, objects };
}

function rebaseValue(
  value: TranslationArchiveJson,
  sourceAppId: string,
  targetAppId: string,
  mappings: Record<string, string>,
): TranslationArchiveJson {
  if (typeof value === 'string') {
    if (value === sourceAppId || value.startsWith(`${sourceAppId}/`)) {
      const target = `${targetAppId}${value.slice(sourceAppId.length)}`;
      mappings[value] = target;
      return target;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      rebaseValue(item, sourceAppId, targetAppId, mappings),
    );
  }
  if (value && typeof value === 'object') {
    const output: Record<string, TranslationArchiveJson> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = rebaseValue(
        item,
        sourceAppId,
        targetAppId,
        mappings,
      );
    }
    return output;
  }
  return value;
}

function contentIdentity(
  nodeIri: string,
  fieldIri: string,
): string {
  return JSON.stringify([nodeIri, fieldIri]);
}

/**
 * Build a pure, conditional restore plan. A blocked plan is never executable:
 * collisions and unresolved cross-app content mappings must be resolved first.
 */
export async function planTranslationArchiveRestore(
  archive: ParsedTranslationArchive,
  options: PlanTranslationArchiveRestoreOptions,
): Promise<TranslationArchiveRestorePlan> {
  const sourceAppId = archive.manifest.appId;
  const targetAppId = requiredString(options.targetAppId, 'targetAppId');
  if (options.mode === 'same-app' && sourceAppId !== targetAppId) {
    throw new Error(
      `Same-app restore requires target app "${sourceAppId}".`,
    );
  }
  const targetById = new Map(
    (options.targetRecords ?? []).map((item) => [
      requiredString(item.id, 'targetRecords.id'),
      normalizeHash(item.contentHash, 'targetRecords.contentHash'),
    ]),
  );
  const contentMappings = new Map(
    (options.contentMappings ?? []).map((mapping) => [
      contentIdentity(mapping.sourceNodeIri, mapping.sourceFieldIri),
      mapping,
    ]),
  );
  const iriMappings: Record<string, string> = {};
  const decisions: TranslationArchiveRestoreDecision[] = [];
  let historicalReleases = 0;

  for (const collection of TRANSLATION_ARCHIVE_COLLECTIONS) {
    for (const sourceRecord of archive.collections[collection]) {
      let targetId = sourceRecord.id;
      let data = sourceRecord.data;
      if (options.mode === 'cross-app') {
        targetId = rebaseValue(
          sourceRecord.id,
          sourceAppId,
          targetAppId,
          iriMappings,
        ) as string;
        data = rebaseValue(
          sourceRecord.data,
          sourceAppId,
          targetAppId,
          iriMappings,
        ) as Record<string, TranslationArchiveJson>;
      }

      if (collection === 'content' && options.mode === 'cross-app') {
        const sourceNodeIri =
          typeof sourceRecord.data.nodeIri === 'string'
            ? sourceRecord.data.nodeIri
            : '';
        const sourceFieldIri =
          typeof sourceRecord.data.fieldIri === 'string'
            ? sourceRecord.data.fieldIri
            : '';
        const mapping = contentMappings.get(
          contentIdentity(sourceNodeIri, sourceFieldIri),
        );
        if (!mapping) {
          decisions.push({
            collection,
            sourceId: sourceRecord.id,
            targetId,
            action: 'unmapped',
            reason: 'Cross-app content requires an explicit node/field mapping.',
            retryKey: canonicalJson([
              archive.manifest.archiveContentHash,
              collection,
              sourceRecord.id,
              'unmapped',
            ]),
          });
          continue;
        }
        data = {
          ...data,
          nodeIri: mapping.targetNodeIri,
          fieldIri: mapping.targetFieldIri,
        };
        iriMappings[sourceNodeIri] = mapping.targetNodeIri;
        iriMappings[sourceFieldIri] = mapping.targetFieldIri;
      }

      if (collection === 'releases') {
        historicalReleases += 1;
        data = {
          ...data,
          status: 'retired',
          historical: true,
          activationEligible: false,
        };
      }
      const targetRecordInput = { id: targetId, data };
      const targetRecord: TranslationArchiveEntity = {
        ...targetRecordInput,
        contentHash: await sha256Bytes(canonicalBytes(targetRecordInput)),
      };
      const currentHash = targetById.get(targetId);
      const action =
        currentHash === undefined
          ? 'create'
          : currentHash === targetRecord.contentHash
            ? 'skip'
            : 'collision';
      decisions.push({
        collection,
        sourceId: sourceRecord.id,
        targetId,
        action,
        ...(currentHash ? { expectedTargetContentHash: currentHash } : {}),
        record: targetRecord,
        ...(action === 'collision'
          ? { reason: 'Target id exists with different content.' }
          : {}),
        retryKey: canonicalJson([
          archive.manifest.archiveContentHash,
          collection,
          targetId,
          targetRecord.contentHash,
        ]),
      });
    }
  }

  const collisions = decisions.filter(
    ({ action }) => action === 'collision',
  ).length;
  const unresolvedContent = decisions.filter(
    ({ action }) => action === 'unmapped',
  ).length;
  return {
    schemaVersion: 1,
    mode: options.mode,
    sourceAppId,
    targetAppId,
    sourceBranchId: archive.manifest.branchId,
    archiveContentHash: archive.manifest.archiveContentHash,
    archiveRevisionWatermark: archive.manifest.revisionWatermark,
    ...(options.targetRevisionWatermark
      ? {
          expectedTargetRevisionWatermark: requiredString(
            options.targetRevisionWatermark,
            'targetRevisionWatermark',
          ),
        }
      : {}),
    blocked: collisions > 0 || unresolvedContent > 0,
    decisions,
    iriMappings,
    creates: decisions.filter(({ action }) => action === 'create').length,
    skips: decisions.filter(({ action }) => action === 'skip').length,
    collisions,
    unresolvedContent,
    historicalReleases,
    identityWrites: 0,
    assignmentWrites: 0,
  };
}
