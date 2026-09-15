import { Shape } from '@_linked/core/shapes/Shape';
import { literalProperty } from '@_linked/core/shapes/SHACL';
import { tr } from '../ontologies/translation.js';
import { linkedShape } from '../package.js';

/**
 * A glossary entry that steers machine translation (Plan 014 AD-L) — e.g. keep
 * a brand/term consistent or fixed across languages. Fed to the MT provider's
 * prompt. Per-app content like the rest of the translation model.
 */
@linkedShape
export class GlossaryTerm extends Shape {
  static targetClass = tr.GlossaryTerm;

  /** The source term (English). */
  @literalProperty({ path: tr.term, maxCount: 1 })
  get term(): string {
    return '';
  }

  /** Preferred translation for the target language (optional; empty = keep as-is). */
  @literalProperty({ path: tr.glossaryTranslation, maxCount: 1 })
  get translation(): string {
    return '';
  }

  /** Target language this entry applies to (empty = all). */
  @literalProperty({ path: tr.glossaryLanguage, maxCount: 1 })
  get language(): string {
    return '';
  }

  @literalProperty({ path: tr.description, maxCount: 1 })
  get description(): string {
    return '';
  }

  /**
   * Termbase entry type (Plan 017 B2-1): 'prefer' = always translate as
   * {@link translation}; 'keep' = do-not-translate, preserved exactly (proper
   * nouns, stay-one-language words); 'forbid' = never use this word/spelling —
   * {@link useInstead} names the replacement (alternative-spelling policing).
   */
  @literalProperty({ path: tr.termType, maxCount: 1 })
  get termType(): string {
    return 'prefer';
  }

  /** Replacement wording for a 'forbid' entry. */
  @literalProperty({ path: tr.useInstead, maxCount: 1 })
  get useInstead(): string {
    return '';
  }

  /** Match with exact casing (proper nouns / all-caps brand styling). */
  @literalProperty({ path: tr.caseSensitive, maxCount: 1 })
  get caseSensitive(): boolean {
    return false;
  }
}
