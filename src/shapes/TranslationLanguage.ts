import { Shape } from '@_linked/core/shapes/Shape';
import { literalProperty, objectProperty } from '@_linked/core/shapes/SHACL';
import { linkedShape } from '../package.js';
import { tr } from '../ontologies/translation.js';

/** App language configuration. Hosts choose the explicit control-plane store. */
@linkedShape
export class TranslationLanguage extends Shape {
  static targetClass = tr.TranslationLanguage;

  @objectProperty({ path: tr.ofApplication, maxCount: 1 })
  get ofApplication(): string {
    return '';
  }
  @objectProperty({ path: tr.languageIdentifier, maxCount: 1 })
  get identifier(): string {
    return '';
  }
  @literalProperty({ path: tr.languageCode, maxCount: 1 })
  get code(): string {
    return '';
  }
  @literalProperty({ path: tr.nativeName, maxCount: 1 })
  get nativeName(): string {
    return '';
  }
  @literalProperty({ path: tr.englishName, maxCount: 1 })
  get englishName(): string {
    return '';
  }
  @literalProperty({ path: tr.textDirection, maxCount: 1 })
  get direction(): string {
    return 'ltr';
  }
  @objectProperty({ path: tr.parentLanguage, maxCount: 1 })
  get parent(): string {
    return '';
  }
  @objectProperty({ path: tr.fallbackLanguage, maxCount: 1 })
  get fallback(): string {
    return '';
  }
  @literalProperty({ path: tr.languageEnabled, maxCount: 1 })
  get enabled(): boolean {
    return false;
  }
  @literalProperty({ path: tr.languageSupported, maxCount: 1 })
  get supported(): boolean {
    return false;
  }
}
