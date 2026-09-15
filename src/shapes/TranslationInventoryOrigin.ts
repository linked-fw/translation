import { Shape } from '@_linked/core/shapes/Shape';
import { literalProperty, objectProperty } from '@_linked/core/shapes/SHACL';
import { xsd } from '@_linked/core/ontologies/xsd';
import { tr } from '../ontologies/translation.js';
import { linkedShape } from '../package.js';

/**
 * One observed origin for a branch translation-inventory item.
 *
 * Host code executes queries for this shape against the explicit branch
 * metadata dataset. It is intentionally not globally pinned by the portable
 * package: standalone LINKED apps may use a different metadata topology.
 */
@linkedShape
export class TranslationInventoryOrigin extends Shape {
  static targetClass = tr.TranslationInventoryOrigin;

  @objectProperty({ path: tr.ofApplication, maxCount: 1 })
  get ofApplication(): string {
    return '';
  }

  @objectProperty({ path: tr.inventoryBranch, maxCount: 1 })
  get branch(): string {
    return '';
  }

  @literalProperty({ path: tr.inventoryIdentity, maxCount: 1 })
  get identity(): string {
    return '';
  }

  @literalProperty({ path: tr.key, maxCount: 1 })
  get key(): string {
    return '';
  }

  @literalProperty({ path: tr.namespace, maxCount: 1 })
  get namespace(): string {
    return '';
  }

  @literalProperty({ path: tr.sourceText, maxCount: 1 })
  get sourceText(): string {
    return '';
  }

  @literalProperty({ path: tr.kind, maxCount: 1 })
  get kind(): string {
    return 'ui';
  }

  @literalProperty({ path: tr.format, maxCount: 1 })
  get format(): string {
    return 'simple';
  }

  @literalProperty({ path: tr.description, maxCount: 1 })
  get description(): string {
    return '';
  }

  @literalProperty({ path: tr.inventoryStatus, maxCount: 1 })
  get status(): string {
    return 'pending';
  }

  @literalProperty({ path: tr.inventorySource, maxCount: 1 })
  get sourceKind(): string {
    return '';
  }

  @literalProperty({ path: tr.inventorySourceId, maxCount: 1 })
  get sourceId(): string {
    return '';
  }

  @literalProperty({ path: tr.inventoryAuthoritative, maxCount: 1 })
  get authoritative(): boolean {
    return false;
  }

  @literalProperty({ path: tr.inventoryFile, maxCount: 1 })
  get file(): string {
    return '';
  }

  @literalProperty({ path: tr.inventoryLine, datatype: xsd.integer, maxCount: 1 })
  get line(): number {
    return 0;
  }

  @objectProperty({ path: tr.inventoryOwner, maxCount: 1 })
  get ownerIri(): string {
    return '';
  }

  @objectProperty({ path: tr.inventoryShape, maxCount: 1 })
  get shapeIri(): string {
    return '';
  }

  @objectProperty({ path: tr.inventoryProperty, maxCount: 1 })
  get propertyIri(): string {
    return '';
  }

  @objectProperty({ path: tr.inventoryNode, maxCount: 1 })
  get nodeIri(): string {
    return '';
  }

  @literalProperty({ path: tr.fromPackage, maxCount: 1 })
  get fromPackage(): string {
    return '';
  }

  @literalProperty({ path: tr.inventoryTargetClass, maxCount: 1 })
  get targetClass(): string {
    return '';
  }

  @literalProperty({
    path: tr.inventoryObservedAt,
    datatype: xsd.dateTime,
    maxCount: 1,
  })
  get observedAt(): Date {
    return new Date(0);
  }
}
