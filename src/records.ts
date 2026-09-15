/** Review lifecycle shared by the portable runtime and authoring clients. */
export type TranslationState =
  | 'untranslated'
  | 'machine'
  | 'reviewed'
  | 'stale';

/** Plain RPC-safe value for one language. Never contains a live Shape. */
export interface TranslationUnitRecord {
  language: string;
  text: string;
  state: TranslationState;
  /** Machine-provider provenance for the current value (`tm` for memory). */
  origin?: string;
  updatedAt?: string;
  keyVersionId?: string;
}

/** Plain immutable source/argument-contract record for Studio and RPC. */
export interface TranslationKeyVersionRecord {
  id: string;
  versionId: string;
  sourceLanguage: string;
  sourceText: string;
  format: 'simple' | 'icu';
  argumentSignature: string;
  contractHash: string;
  sourceHash: string;
  supersedes?: string;
  createdAt?: string;
  createdBy?: string;
}

export type TranslationReleaseChannel = 'preview' | 'production';
export type TranslationReleaseStatus =
  | 'draft'
  | 'published'
  | 'superseded'
  | 'retired';

/** Plain graph metadata for a schema-v2 translation release. */
export interface TranslationReleaseRecord {
  id: string;
  releaseId: string;
  appId: string;
  branchId: string;
  buildId?: string;
  channel: TranslationReleaseChannel;
  status: TranslationReleaseStatus;
  contractSetHash: string;
  manifestHash: string;
  hotfixSequence: number;
  qualitySummary?: string;
  createdAt: string;
  publishedAt?: string;
  supportedUntil?: string;
  supersedes?: string;
}

/** Lifecycle of one authored value (Plan 017 AD-P). */
export type TranslationRevisionStatus =
  | 'applied' // a direct edit, recorded as history
  | 'proposed' // awaiting a reviewer (human author)
  | 'suggested' // awaiting a reviewer (machine author)
  | 'accepted'
  | 'rejected'
  | 'superseded';

/** Plain RPC-safe view of one revision (history entry / pending value). */
export interface TranslationRevisionRecord {
  id: string;
  key: string;
  language: string;
  text: string;
  status: TranslationRevisionStatus;
  author?: string;
  authorKind: 'human' | 'machine';
  mtProvider?: string;
  basedOnText?: string;
  note?: string;
  createdAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  keyVersionId?: string;
  /** Current unit diverged after this proposal was authored. */
  conflicted?: boolean;
  currentText?: string;
}

export interface TranslationProposalDecision {
  revision: TranslationRevisionRecord;
  unit?: TranslationUnitRecord;
}

export type TranslationMemoryMatchKind = 'exact' | 'carry-forward';

/**
 * One reviewed unit that can seed the current key version. Exact source
 * matches may pretranslate as machine/TM; changed source text is an explicit
 * same-key carry-forward review.
 */
export interface TranslationMemoryMatchRecord {
  unitId: string;
  key: string;
  language: string;
  text: string;
  keyVersionId: string;
  sourceText: string;
  sourceHash: string;
  contractHash: string;
  kind: TranslationMemoryMatchKind;
  updatedAt?: string;
}

/** Searchable reviewed unit exposed by the explicit Translation Memory browser. */
export interface TranslationMemoryRecord {
  unitId: string;
  key: string;
  language: string;
  text: string;
  keyVersionId: string;
  sourceText: string;
  sourceHash: string;
  contractHash: string;
  updatedAt?: string;
}

export interface TranslationMemoryPretranslateCandidate {
  key: string;
  language: string;
  unitId: string;
  sourceKey: string;
  text: string;
}

export interface TranslationMemoryPretranslateReport {
  language: string;
  eligible: number;
  translated: number;
  candidates: TranslationMemoryPretranslateCandidate[];
}

/** Termbase entry behavior (Plan 017 B2-1). */
export type GlossaryTermType = 'prefer' | 'keep' | 'forbid';

/** Plain RPC-safe termbase entry (steers MT + checks; Plan 014 AD-L / 017 B2). */
export interface GlossaryTermRecord {
  id: string;
  term: string;
  /** prefer = translate as `translation`; keep = do-not-translate; forbid = never use. */
  termType: GlossaryTermType;
  /** Preferred translation (prefer entries). */
  translation?: string;
  /** Replacement wording (forbid entries — alternative-spelling policing). */
  useInstead?: string;
  /** Target language this applies to; empty = all languages. */
  language?: string;
  /** Exact-casing match (proper nouns / all-caps styling). */
  caseSensitive?: boolean;
  description?: string;
}

/** Plain RPC-safe editor/runtime view of a key and its language values. */
export interface TranslationEntryRecord {
  key: string;
  namespace: string;
  sourceText: string;
  description?: string;
  kind: 'ui' | 'content';
  format: 'simple' | 'icu';
  /** Optional semantic organization for translations supplied with LINKED shapes. */
  ofShape?: string;
  ofProperty?: string;
  fromPackage?: string;
  /** This app diverged a shape-owned key locally; shape propagation skips it (AD-N). */
  overridden?: boolean;
  currentVersion?: TranslationKeyVersionRecord;
  versions?: TranslationKeyVersionRecord[];
  units: Record<string, TranslationUnitRecord>;
}
