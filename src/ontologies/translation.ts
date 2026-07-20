import { createNameSpace } from '@_linked/core/utils/NameSpace';
import { linkedOntology } from '../package.js';
import * as _this from './translation.js';

/** Lazy-load the (currently empty) serialized ontology graph. */
export var loadData = () => {
  //@ts-ignore
  return import('../data/translation.json', { with: { type: 'json' } }).then(
    (data) => data.default,
  );
};

/** Vocabulary namespace for the translation package. */
export var ns = createNameSpace('https://id.linked.cm/translation/vocab#');
export var _self = ns('');

// ── Classes ─────────────────────────────────────────────────────────────
export var TranslationKey = ns('TranslationKey');
export var TranslationUnit = ns('TranslationUnit');
export var GlossaryTerm = ns('GlossaryTerm');

// ── TranslationKey properties ───────────────────────────────────────────
export var namespace = ns('namespace');
export var key = ns('key');
export var sourceText = ns('sourceText'); // canonical English (Plan 014 AD-J/R7)
export var description = ns('description');
export var kind = ns('kind'); // 'ui' | 'content' (AD-I)
export var ofApplication = ns('ofApplication'); // owning app IRI (AD-H/R2)
export var ofNode = ns('ofNode'); // content-translation subject (kind:'content')
export var ofField = ns('ofField');
export var format = ns('format'); // 'simple' | 'icu' (AD-J/R8)

// ── TranslationUnit properties ──────────────────────────────────────────
export var ofKey = ns('ofKey'); // → TranslationKey
export var language = ns('language'); // BCP-47 tag
export var text = ns('text');
export var state = ns('state'); // untranslated | machine | reviewed | stale
export var updatedAt = ns('updatedAt');
export var updatedBy = ns('updatedBy');

// ── GlossaryTerm properties ─────────────────────────────────────────────
export var term = ns('term');
export var glossaryTranslation = ns('glossaryTranslation');
export var glossaryLanguage = ns('glossaryLanguage');

/** Grouped export for prefix/name access. */
export const tr = {
  TranslationKey,
  TranslationUnit,
  GlossaryTerm,
  namespace,
  key,
  sourceText,
  description,
  kind,
  ofApplication,
  ofNode,
  ofField,
  format,
  ofKey,
  language,
  text,
  state,
  updatedAt,
  updatedBy,
  term,
  glossaryTranslation,
  glossaryLanguage,
};

linkedOntology(_this, ns, 'translation', loadData, '../data/translation.json');
