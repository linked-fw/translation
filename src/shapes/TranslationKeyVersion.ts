import { Shape } from '@_linked/core/shapes/Shape';
import { literalProperty, objectProperty } from '@_linked/core/shapes/SHACL';
import { xsd } from '@_linked/core/ontologies/xsd';
import { tr } from '../ontologies/translation.js';
import { linkedShape } from '../package.js';
import { TranslationKey } from './TranslationKey.js';

/** Immutable source text + runtime argument contract for one logical key. */
@linkedShape
export class TranslationKeyVersion extends Shape {
  static targetClass = tr.TranslationKeyVersion;

  @objectProperty({ path: tr.ofApplication, maxCount: 1 })
  get ofApplication(): string {
    return '';
  }

  @objectProperty({ path: tr.ofKey, shape: TranslationKey, maxCount: 1 })
  get ofKey(): TranslationKey {
    return undefined as any;
  }

  /** Monotonic ULID for new versions; deterministic `backfill-*` for migration. */
  @literalProperty({ path: tr.versionId, maxCount: 1 })
  get versionId(): string {
    return '';
  }

  @literalProperty({ path: tr.sourceLanguage, maxCount: 1 })
  get sourceLanguage(): string {
    return '';
  }

  @literalProperty({ path: tr.sourceText, maxCount: 1 })
  get sourceText(): string {
    return '';
  }

  @literalProperty({ path: tr.format, maxCount: 1 })
  get format(): string {
    return 'simple';
  }

  @literalProperty({ path: tr.argumentSignature, maxCount: 1 })
  get argumentSignature(): string {
    return '[]';
  }

  @literalProperty({ path: tr.contractHash, maxCount: 1 })
  get contractHash(): string {
    return '';
  }

  @literalProperty({ path: tr.sourceHash, maxCount: 1 })
  get sourceHash(): string {
    return '';
  }

  @objectProperty({
    path: tr.supersedes,
    shape: TranslationKeyVersion,
    maxCount: 1,
  })
  get supersedes(): TranslationKeyVersion {
    return undefined as any;
  }

  @literalProperty({ path: tr.createdAt, datatype: xsd.dateTime, maxCount: 1 })
  get createdAt(): Date {
    return new Date(0);
  }

  @objectProperty({ path: tr.createdBy, maxCount: 1 })
  get createdBy(): string {
    return '';
  }
}
