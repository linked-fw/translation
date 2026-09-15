import { createNameSpace } from '@_linked/core/utils/NameSpace';
import { linkedOntology } from '../package.js';
import * as _this from './translation.js';

/** Lazy-load the (currently empty) serialized ontology graph. */
export var loadData = () => {
  //@ts-ignore
  return import('../data/translation.json', { with: { type: 'json' } }).then(
    (data) => data.default
  );
};

/** Vocabulary namespace for the translation package. */
export var ns = createNameSpace('https://id.linked.cm/translation/vocab#');
export var _self = ns('');

// ── Classes ─────────────────────────────────────────────────────────────
export var TranslationKey = ns('TranslationKey');
export var TranslationKeyVersion = ns('TranslationKeyVersion');
export var TranslationRelease = ns('TranslationRelease');
export var TranslationUnit = ns('TranslationUnit');
export var TranslationRevision = ns('TranslationRevision');
export var GlossaryTerm = ns('GlossaryTerm');
export var TranslationInventoryOrigin = ns('TranslationInventoryOrigin');

// Open language resources; BCP-47 is a string identifier, not an enum.
export var TranslationLanguage = ns('TranslationLanguage');
export var languageIdentifier = ns('languageIdentifier');
export var languageCode = ns('languageCode');
export var nativeName = ns('nativeName');
export var englishName = ns('englishName');
export var textDirection = ns('textDirection');
export var parentLanguage = ns('parentLanguage');
export var fallbackLanguage = ns('fallbackLanguage');
export var languageEnabled = ns('languageEnabled');
export var languageSupported = ns('languageSupported');

// ── TranslationKey properties ───────────────────────────────────────────
export var namespace = ns('namespace');
export var key = ns('key');
export var sourceText = ns('sourceText'); // canonical English (Plan 014 AD-J/R7)
export var description = ns('description');
export var kind = ns('kind'); // 'ui' | 'content' (AD-I)
export var ofApplication = ns('ofApplication'); // owning app IRI (AD-H/R2)
export var ofNode = ns('ofNode'); // content-translation subject (kind:'content')
export var ofField = ns('ofField');
export var ofShape = ns('ofShape'); // semantic SHACL shape context for package keys
export var ofProperty = ns('ofProperty'); // semantic predicate context for package keys
export var fromPackage = ns('fromPackage'); // package that supplied a seed catalog
export var overridden = ns('overridden'); // app diverged this shape key from canonical → excluded from shape propagation (AD-N)
export var shapeSource = ns('shapeSource'); // canonical source snapshot at override time → the value "clear override" reverts to (AD-N)
export var format = ns('format'); // 'simple' | 'icu' (AD-J/R8)
export var currentVersion = ns('currentVersion'); // → TranslationKeyVersion

// ── TranslationKeyVersion properties (Plan 018) ────────────────────────
export var versionId = ns('versionId');
export var sourceLanguage = ns('sourceLanguage');
export var argumentSignature = ns('argumentSignature');
export var contractHash = ns('contractHash');
export var sourceHash = ns('sourceHash');
export var supersedes = ns('supersedes');
export var createdBy = ns('createdBy');

// ── TranslationRelease properties (Plan 018) ───────────────────────────
export var branch = ns('branch');
export var releaseId = ns('releaseId');
export var buildId = ns('buildId');
export var channel = ns('channel');
export var contractSetHash = ns('contractSetHash');
export var manifestHash = ns('manifestHash');
export var hotfixSequence = ns('hotfixSequence');
export var publishedAt = ns('publishedAt');
export var supportedUntil = ns('supportedUntil');
export var qualitySummary = ns('qualitySummary');

// ── CapabilityAppConfig properties (stored in Create Now's cn-main) ────
export var languages = ns('languages'); // active BCP-47 tags, including source
export var defaultLanguage = ns('defaultLanguage'); // authored/source language
export var cdnTarget = ns('cdnTarget'); // delivery base URL / bucket prefix — the "repoint" knob (AD-K, P2)
export var autoPublish = ns('autoPublish'); // boolean — overridable auto-publish-on-edit toggle (P2, default off)
export var reviewedOnlyLanguage = ns('reviewedOnlyLanguage'); // BCP-47 tags published reviewed-only; absence ⇒ machine-ok (AD-K/R9, P2)
export var mtDefault = ns('mtDefault'); // default MT provider key (AD-L, unused until P4)
export var mtFormality = ns('mtFormality'); // multi-value: "formal" (app default) or "de:informal" (per-language) — Plan 017 §7.4b
export var mtStyleNote = ns('mtStyleNote'); // free-text tone guidance fed to LLM MT providers (Plan 017 §7.4b)

// ── TranslationUnit properties ──────────────────────────────────────────
export var ofKey = ns('ofKey'); // → TranslationKey
export var ofKeyVersion = ns('ofKeyVersion'); // → TranslationKeyVersion
export var language = ns('language'); // BCP-47 tag
export var text = ns('text');
export var state = ns('state'); // untranslated | machine | reviewed | stale
export var updatedAt = ns('updatedAt');
export var updatedBy = ns('updatedBy');
export var origin = ns('origin'); // current-value provenance, e.g. `tm`

// ── TranslationRevision properties (Plan 017 AD-P) ─────────────────────
// One append-only node per authored value: history (`applied`), translator
// proposals (`proposed`), and MT suggestions (`suggested`) share the shape.
export var status = ns('status'); // applied | proposed | suggested | accepted | rejected | superseded
export var author = ns('author'); // WebID or MT provider IRI
export var authorKind = ns('authorKind'); // 'human' | 'machine'
export var mtProvider = ns('mtProvider'); // provider key when authorKind=machine
export var basedOnText = ns('basedOnText'); // unit text at authoring time (conflict detection)
export var note = ns('note'); // translator/reviewer comment
export var createdAt = ns('createdAt');
export var decidedAt = ns('decidedAt'); // when a proposal/suggestion was accepted/rejected
export var decidedBy = ns('decidedBy'); // WebID of the reviewer

// ── GlossaryTerm properties ─────────────────────────────────────────────
export var term = ns('term');
export var glossaryTranslation = ns('glossaryTranslation');
export var glossaryLanguage = ns('glossaryLanguage');
export var termType = ns('termType'); // prefer | keep | forbid (Plan 017 B2-1 termbase)
export var useInstead = ns('useInstead'); // replacement for a forbidden term/spelling
export var caseSensitive = ns('caseSensitive'); // boolean — exact-casing matching (proper nouns)

// ── Branch translation inventory metadata (Plan 017 Phase 8b) ─────────
// These records are materialized into the active branch metadata dataset,
// never app data. Confirmed TranslationKey/TranslationUnit records retain
// their existing app-data placement.
export var inventoryBranch = ns('inventoryBranch');
export var inventoryIdentity = ns('inventoryIdentity');
export var inventoryStatus = ns('inventoryStatus');
export var inventorySource = ns('inventorySource');
export var inventorySourceId = ns('inventorySourceId');
export var inventoryAuthoritative = ns('inventoryAuthoritative');
export var inventoryFile = ns('inventoryFile');
export var inventoryLine = ns('inventoryLine');
export var inventoryOwner = ns('inventoryOwner');
export var inventoryShape = ns('inventoryShape');
export var inventoryProperty = ns('inventoryProperty');
export var inventoryNode = ns('inventoryNode');
export var inventoryTargetClass = ns('inventoryTargetClass');
export var inventoryObservedAt = ns('inventoryObservedAt');

/** Grouped export for prefix/name access. */
export const tr = {
  TranslationLanguage,
  languageIdentifier,
  languageCode,
  nativeName,
  englishName,
  textDirection,
  parentLanguage,
  fallbackLanguage,
  languageEnabled,
  languageSupported,
  TranslationKey,
  TranslationKeyVersion,
  TranslationRelease,
  TranslationUnit,
  TranslationRevision,
  GlossaryTerm,
  TranslationInventoryOrigin,
  namespace,
  key,
  sourceText,
  description,
  kind,
  ofApplication,
  ofNode,
  ofField,
  ofShape,
  ofProperty,
  fromPackage,
  overridden,
  shapeSource,
  format,
  currentVersion,
  versionId,
  sourceLanguage,
  argumentSignature,
  contractHash,
  sourceHash,
  supersedes,
  createdBy,
  branch,
  releaseId,
  buildId,
  channel,
  contractSetHash,
  manifestHash,
  hotfixSequence,
  publishedAt,
  supportedUntil,
  qualitySummary,
  languages,
  defaultLanguage,
  cdnTarget,
  autoPublish,
  reviewedOnlyLanguage,
  mtDefault,
  mtFormality,
  mtStyleNote,
  ofKey,
  ofKeyVersion,
  language,
  text,
  state,
  updatedAt,
  updatedBy,
  origin,
  status,
  author,
  authorKind,
  mtProvider,
  basedOnText,
  note,
  createdAt,
  decidedAt,
  decidedBy,
  term,
  glossaryTranslation,
  glossaryLanguage,
  termType,
  useInstead,
  caseSensitive,
  inventoryBranch,
  inventoryIdentity,
  inventoryStatus,
  inventorySource,
  inventorySourceId,
  inventoryAuthoritative,
  inventoryFile,
  inventoryLine,
  inventoryOwner,
  inventoryShape,
  inventoryProperty,
  inventoryNode,
  inventoryTargetClass,
  inventoryObservedAt,
};

linkedOntology(_this, ns, 'translation', loadData, '../data/translation.json');
