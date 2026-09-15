import { Shape } from '@_linked/core/shapes/Shape';
import { literalProperty, objectProperty } from '@_linked/core/shapes/SHACL';
import { xsd } from '@_linked/core/ontologies/xsd';
import { tr } from '../ontologies/translation.js';
import { linkedShape } from '../package.js';
import { TranslationKey } from './TranslationKey.js';
import { TranslationKeyVersion } from './TranslationKeyVersion.js';

/**
 * One authored value for a (key, language) cell — append-only (Plan 017 AD-P).
 * A single primitive powers three workflows: change HISTORY (every direct edit
 * records a `status:'applied'` revision), translator PROPOSALS (`proposed`,
 * decided by a reviewer), and MT SUGGESTIONS (`suggested`, authorKind
 * `machine`). The {@link TranslationUnit} stays the fast runtime/grid read
 * path; revisions are never updated in place except their decision fields
 * (`status`, `decidedAt`, `decidedBy`).
 */
@linkedShape
export class TranslationRevision extends Shape {
  static targetClass = tr.TranslationRevision;

  /** IRI of the owning Application (same app-scoping law as Key/Unit). */
  @objectProperty({ path: tr.ofApplication, maxCount: 1 })
  get ofApplication(): string {
    return '';
  }

  /** The key, NOT the unit — revisions can exist before any unit does. */
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

  /** applied | proposed | suggested | accepted | rejected | superseded. */
  @literalProperty({ path: tr.status, maxCount: 1 })
  get status(): string {
    return 'applied';
  }

  /** WebID of the human author, or the MT provider IRI. */
  @objectProperty({ path: tr.author, maxCount: 1 })
  get author(): string {
    return '';
  }

  /** 'human' | 'machine'. */
  @literalProperty({ path: tr.authorKind, maxCount: 1 })
  get authorKind(): string {
    return 'human';
  }

  /** MT provider key ('claude', 'deepl', …) when authorKind is 'machine'. */
  @literalProperty({ path: tr.mtProvider, maxCount: 1 })
  get mtProvider(): string {
    return '';
  }

  /** The unit's text when this revision was authored (conflict detection). */
  @literalProperty({ path: tr.basedOnText, maxCount: 1 })
  get basedOnText(): string {
    return '';
  }

  /** Free-text translator/reviewer comment. */
  @literalProperty({ path: tr.note, maxCount: 1 })
  get note(): string {
    return '';
  }

  @literalProperty({ path: tr.createdAt, datatype: xsd.dateTime, maxCount: 1 })
  get createdAt(): Date {
    return new Date(0);
  }

  @literalProperty({ path: tr.decidedAt, datatype: xsd.dateTime, maxCount: 1 })
  get decidedAt(): Date {
    return new Date(0);
  }

  /** WebID of the reviewer who accepted/rejected a pending revision. */
  @objectProperty({ path: tr.decidedBy, maxCount: 1 })
  get decidedBy(): string {
    return '';
  }
}
