// Isomorphic barrel (Plan 014 AD-G): side-effect imports register the ontology
// + shapes into the LINKED tree. Safe on client and server — no backend/Node
// code here (that lives in ./backend.ts). Ontology FIRST, then shapes.
import './ontologies/translation.js';
import './shapes/TranslationKey.js';
import './shapes/TranslationKeyVersion.js';
import './shapes/TranslationRelease.js';
import './shapes/TranslationUnit.js';
import './shapes/TranslationRevision.js';
import './shapes/GlossaryTerm.js';
import './shapes/TranslationInventoryOrigin.js';

export {
  canAuthorTranslation,
  configureTranslationAuthorization,
} from './authorization.js';
export type {
  TranslationAuthoringAction,
  TranslationAuthorizationRequest,
  TranslationAuthorizationResolver,
} from './authorization.js';

export { TranslationKey } from './shapes/TranslationKey.js';
export { TranslationKeyVersion } from './shapes/TranslationKeyVersion.js';
export { TranslationRelease } from './shapes/TranslationRelease.js';
export { TranslationUnit } from './shapes/TranslationUnit.js';
export { TranslationRevision } from './shapes/TranslationRevision.js';
export { GlossaryTerm } from './shapes/GlossaryTerm.js';
export { TranslationInventoryOrigin } from './shapes/TranslationInventoryOrigin.js';
export { tr } from './ontologies/translation.js';
export {
  canonicalLanguageTag,
  classifyKeyVersion,
  createArgumentSignature,
  createMonotonicVersionId,
  deriveBackfillKeyVersion,
  deriveTranslationKeyVersionContract,
  sha256Hex,
} from './key-version.js';
export type {
  DerivedBackfillKeyVersion,
  ExtractedTranslationKeyContract,
  KeyVersionDecision,
  TranslationKeyVersionContract,
  TranslationKeyVersionLike,
} from './key-version.js';
export {
  defineShapeTranslationCatalog,
  installShapeTranslationCatalog,
  shapeCatalogTranslationDiscoverySource,
} from './shape-catalog.js';
export type {
  ShapeTranslationCatalog,
  ShapeTranslationCatalogEntry,
  ShapeTranslationCatalogTarget,
  ShapeTranslationInstallReport,
} from './shape-catalog.js';
export {
  discoverTranslationInventory,
  manifestTranslationDiscoverySource,
  parseTranslationDiscoveryManifest,
  translationBuildDeclarationsFromInventory,
  translationDeclarationIdentity,
} from './discovery.js';
export type {
  DiscoverTranslationInventoryOptions,
  TranslationDeclaration,
  TranslationDeclarationProvenance,
  TranslationDeclarationSource,
  TranslationDiscoveryContext,
  TranslationDiscoveryManifest,
  TranslationDiscoveryManifestEntry,
  TranslationDiscoverySource,
  TranslationInventoryConflict,
  TranslationInventoryItem,
  TranslationInventorySnapshot,
  TranslationInventoryStatus,
} from './discovery.js';
export {
  linkedPackageTranslationDiscoverySource,
  parseLinkedPackageTranslationCatalog,
} from './linked-discovery.js';
export type {
  LinkedComponentTranslationCatalog,
  LinkedContentTranslationCatalogEntry,
  LinkedPackageTranslationCatalog,
  LinkedSemanticCatalogEntry,
  LinkedSemanticEntryType,
} from './linked-discovery.js';
export {
  clearTranslationFormatAdapters,
  getTranslationFormatAdapter,
  isConfirmedBuildDeclaration,
  listTranslationFormatAdapters,
  normalizeParsedTranslationExchangeDocument,
  registerTranslationFormatAdapter,
  validateTranslationExchangeDocument,
} from './exchange.js';
export type {
  ParsedTranslationExchangeDocument,
  ParsedTranslationExchangeEntry,
  SerializedTranslationDocument,
  TranslationBuildDeclaration,
  TranslationDeclarationKind,
  TranslationDeclarationStatus,
  TranslationExchangeDocument,
  TranslationExchangeEntry,
  TranslationExchangeKind,
  TranslationExchangeValue,
  TranslationFormat,
  TranslationFormatAdapter,
  TranslationImportDisposition,
  TranslationImportDryRun,
  TranslationImportDryRunEntry,
} from './exchange.js';
export {
  commitVersionedImport,
  flattenMessages,
  hasIcuSyntax,
  planVersionedImport,
  runImport,
  tolgeeCdnSource,
  translationUnitContentHash,
} from './import.js';
export type {
  ImportMergePolicy,
  ImportOptions,
  ImportReport,
  ImportTarget,
  ParsedUnit,
  TranslationImportSource,
  VersionedImportCommitReport,
  VersionedImportCurrentState,
  VersionedImportDecision,
  VersionedImportPlan,
  VersionedImportPlanOptions,
  VersionedImportTarget,
} from './import.js';
export { createTranslationExchangeDocument } from './export.js';
export type {
  TranslationExportFinding,
  TranslationExportOptions,
  TranslationExportResult,
} from './export.js';
export { translationCsvAdapter } from './formats/csv.js';
export { xliff12Adapter, xliff20Adapter } from './formats/xliff.js';
export type { XliffFinding, XliffParseOptions } from './formats/xliff.js';
export {
  DEFAULT_TRANSLATION_JSON_ARCHIVE_LIMITS,
  i18nextJsonFormatAdapter,
  parseI18nextJson,
  serializeI18nextJsonZip,
} from './formats/json.js';
export type {
  I18nextJsonLayout,
  TranslationJsonArchiveLimits,
  TranslationJsonParseOptions,
  TranslationJsonSerializeOptions,
} from './formats/json.js';
export {
  DEFAULT_TRANSLATION_ARCHIVE_LIMITS,
  createTranslationArchive,
  parseTranslationArchive,
  planTranslationArchiveRestore,
  TRANSLATION_ARCHIVE_COLLECTIONS,
  TRANSLATION_ARCHIVE_EXCLUSIONS,
  TRANSLATION_ARCHIVE_MANIFEST_PATH,
} from './archive.js';
export type {
  ParsedTranslationArchive,
  PlanTranslationArchiveRestoreOptions,
  SerializedTranslationArchive,
  TranslationArchiveCollection,
  TranslationArchiveContentMapping,
  TranslationArchiveEntity,
  TranslationArchiveEntityInput,
  TranslationArchiveFileInventory,
  TranslationArchiveJson,
  TranslationArchiveManifest,
  TranslationArchiveObjectInput,
  TranslationArchiveObjectInventory,
  TranslationArchiveRestoreDecision,
  TranslationArchiveRestorePlan,
  TranslationArchiveSnapshot,
  TranslationArchiveTargetRecord,
} from './archive.js';
export type {
  GlossaryTermRecord,
  TranslationEntryRecord,
  TranslationRevisionRecord,
  TranslationRevisionStatus,
  TranslationMemoryMatchKind,
  TranslationMemoryMatchRecord,
  TranslationMemoryPretranslateCandidate,
  TranslationMemoryPretranslateReport,
  TranslationMemoryRecord,
  TranslationProposalDecision,
  TranslationReleaseChannel,
  TranslationReleaseRecord,
  TranslationReleaseStatus,
  TranslationState,
  TranslationKeyVersionRecord,
  TranslationUnitRecord,
} from './records.js';

export { TranslationLanguage } from './shapes/TranslationLanguage.js';
export * from './languages.js';
