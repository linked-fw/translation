import { Shape } from '@_linked/core/shapes/Shape';
import { literalProperty, objectProperty } from '@_linked/core/shapes/SHACL';
import { xsd } from '@_linked/core/ontologies/xsd';
import { tr } from '../ontologies/translation.js';
import { linkedShape } from '../package.js';
import { TranslationKey } from './TranslationKey.js';
import { TranslationKeyVersion } from './TranslationKeyVersion.js';

/**
 * One language's value for a {@link TranslationKey} (Plan 014 AD-H). Explicit
 * per-language node (not `rdf:langString`) so it can be filtered per-language
 * through the LINKED DSL AND carry management metadata — review `state` and
 * provenance — that a bare literal cannot hold.
 */
@linkedShape
export class TranslationUnit extends Shape {
  static targetClass = tr.TranslationUnit;

  /** IRI of the owning Application (explicitly app-scoped per Plan 014 AD-I). */
  @objectProperty({ path: tr.ofApplication, maxCount: 1 })
  get ofApplication(): string {
    return '';
  }

  @objectProperty({ path: tr.ofKey, shape: TranslationKey, maxCount: 1 })
  get ofKey(): TranslationKey {
    return undefined as any;
  }

  @objectProperty({
    path: tr.ofKeyVersion,
    shape: TranslationKeyVersion,
    maxCount: 1,
  })
  get ofKeyVersion(): TranslationKeyVersion {
    return undefined as any;
  }

  /** BCP-47 language tag, e.g. "es", "zh-Hans". */
  @literalProperty({ path: tr.language, maxCount: 1 })
  get language(): string {
    return '';
  }

  @literalProperty({ path: tr.text, maxCount: 1 })
  get text(): string {
    return '';
  }

  /** untranslated | machine | reviewed | stale. */
  @literalProperty({ path: tr.state, maxCount: 1 })
  get state(): string {
    return 'untranslated';
  }

  @literalProperty({ path: tr.updatedAt, datatype: xsd.dateTime, maxCount: 1 })
  get updatedAt(): Date {
    return new Date(0);
  }

  /** WebID (IRI) of the last editor. */
  @objectProperty({ path: tr.updatedBy, maxCount: 1 })
  get updatedBy(): string {
    return '';
  }

  /** Current-value provenance (`tm` for exact translation-memory reuse). */
  @literalProperty({ path: tr.origin, maxCount: 1 })
  get origin(): string {
    return '';
  }
}
