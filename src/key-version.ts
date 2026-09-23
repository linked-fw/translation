import type { MessageFormat } from './core/messages.js';
import { analyzeMessage } from './message-format.js';

export interface TranslationKeyVersionContract {
  sourceLanguage: string;
  sourceText: string;
  format: MessageFormat;
  argumentSignature: string;
  contractHash: string;
  sourceHash: string;
}

export interface DerivedBackfillKeyVersion
  extends TranslationKeyVersionContract {
  versionId: string;
}

export interface TranslationKeyVersionLike {
  sourceText: string;
  format: MessageFormat;
  argumentSignature: string;
}

export interface ExtractedTranslationKeyContract {
  sourceText: string;
  format: MessageFormat;
}

export interface KeyVersionDecision {
  action: 'unchanged' | 'create-version' | 'retire';
  reason:
    | 'same-source-and-contract'
    | 'source-changed'
    | 'format-changed'
    | 'argument-contract-changed'
    | 'missing-from-source';
}

const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const BIGINT_FIVE = BigInt(5);
const BIGINT_EIGHT = BigInt(8);
const BIGINT_THIRTY_ONE = BigInt(31);
let lastUlidTime = -1;
let lastUlidRandom = new Uint8Array(10);

function encodeUlidTime(timestamp: number): string {
  let value = BigInt(timestamp);
  let encoded = '';
  for (let index = 0; index < 10; index++) {
    encoded = ULID_ALPHABET[Number(value & BIGINT_THIRTY_ONE)] + encoded;
    value >>= BIGINT_FIVE;
  }
  return encoded;
}

function encodeUlidRandom(bytes: Uint8Array): string {
  let value = BigInt(0);
  for (const byte of bytes) value = (value << BIGINT_EIGHT) | BigInt(byte);
  let encoded = '';
  for (let index = 0; index < 16; index++) {
    encoded = ULID_ALPHABET[Number(value & BIGINT_THIRTY_ONE)] + encoded;
    value >>= BIGINT_FIVE;
  }
  return encoded;
}

function incrementRandom(bytes: Uint8Array): Uint8Array {
  const next = new Uint8Array(bytes);
  for (let index = next.length - 1; index >= 0; index--) {
    next[index] = (next[index] + 1) & 0xff;
    if (next[index] !== 0) return next;
  }
  throw new Error('ULID random component overflowed within one millisecond.');
}

/** Monotonic ULID for newly authored key versions. */
export function createMonotonicVersionId(
  now = Date.now(),
  randomBytes?: Uint8Array,
): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > 0xffffffffffff) {
    throw new Error('ULID timestamp is outside the supported 48-bit range.');
  }
  const timestamp = Math.max(now, lastUlidTime);
  if (timestamp === lastUlidTime) {
    lastUlidRandom = incrementRandom(lastUlidRandom);
  } else {
    const next = randomBytes ?? globalThis.crypto.getRandomValues(new Uint8Array(10));
    if (next.length !== 10) {
      throw new Error('ULID randomness must contain exactly 10 bytes.');
    }
    lastUlidTime = timestamp;
    lastUlidRandom = new Uint8Array(next);
  }
  return `${encodeUlidTime(timestamp)}${encodeUlidRandom(lastUlidRandom)}`;
}

/** Portable SHA-256 used by both the browser-safe package and Node publishers. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}

export function canonicalLanguageTag(language: string): string {
  const value = language.trim();
  if (!value) throw new Error('sourceLanguage is required.');
  try {
    return Intl.getCanonicalLocales(value)[0] ?? value;
  } catch {
    throw new Error(`Invalid BCP-47 source language: ${language}`);
  }
}

/**
 * Stable runtime-argument contract. Object/argument ordering is canonical so
 * extraction order and translator word order cannot change the hash.
 */
export function createArgumentSignature(
  sourceText: string,
  format: MessageFormat,
): string {
  const analysis = analyzeMessage(sourceText, format);
  if (!analysis.valid) {
    throw new Error(
      `Cannot version invalid ${format.toUpperCase()} source text: ${analysis.error}`,
    );
  }
  return JSON.stringify(
    analysis.arguments.map(({ name, kinds }) => [name, [...kinds].sort()]),
  );
}

export function classifyKeyVersion(
  current: TranslationKeyVersionLike | undefined,
  extracted: ExtractedTranslationKeyContract | undefined,
): KeyVersionDecision {
  if (!extracted) {
    return { action: 'retire', reason: 'missing-from-source' };
  }
  if (!current) {
    return { action: 'create-version', reason: 'source-changed' };
  }
  if (current.format !== extracted.format) {
    return { action: 'create-version', reason: 'format-changed' };
  }
  const nextSignature = createArgumentSignature(
    extracted.sourceText,
    extracted.format,
  );
  if (current.argumentSignature !== nextSignature) {
    return {
      action: 'create-version',
      reason: 'argument-contract-changed',
    };
  }
  if (current.sourceText !== extracted.sourceText) {
    return { action: 'create-version', reason: 'source-changed' };
  }
  return { action: 'unchanged', reason: 'same-source-and-contract' };
}

export async function deriveTranslationKeyVersionContract(input: {
  sourceLanguage: string;
  sourceText: string;
  format: MessageFormat;
}): Promise<TranslationKeyVersionContract> {
  const sourceLanguage = canonicalLanguageTag(input.sourceLanguage);
  const argumentSignature = createArgumentSignature(
    input.sourceText,
    input.format,
  );
  const [sourceHash, contractHash] = await Promise.all([
    sha256Hex(JSON.stringify([sourceLanguage, input.sourceText])),
    sha256Hex(JSON.stringify([input.format, argumentSignature])),
  ]);
  return {
    sourceLanguage,
    sourceText: input.sourceText,
    format: input.format,
    argumentSignature,
    contractHash,
    sourceHash,
  };
}

/**
 * Existing keys need a deterministic first version so a restarted migration
 * cannot create a second node. Future authored versions use monotonic ULIDs.
 */
export async function deriveBackfillKeyVersion(input: {
  sourceLanguage: string;
  sourceText: string;
  format: MessageFormat;
}): Promise<DerivedBackfillKeyVersion> {
  const contract = await deriveTranslationKeyVersionContract(input);
  return {
    ...contract,
    versionId: `backfill-${contract.sourceHash.slice(0, 16)}-${contract.contractHash.slice(0, 16)}`,
  };
}
