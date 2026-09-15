import { Shape } from '@_linked/core/shapes/Shape';
import { literalProperty, objectProperty } from '@_linked/core/shapes/SHACL';
import { Server } from '@_linked/server-utils/utils/Server';
import { tr } from '../ontologies/translation.js';
import { linkedShape } from '../package.js';
import type {
  TranslationEntryRecord,
  TranslationKeyVersionRecord,
  TranslationState,
} from '../records.js';
import type { TranslationMessages } from '../core/messages.js';
import type { TranslationKeyVersion } from './TranslationKeyVersion.js';

/**
 * A translatable key (Plan 014 AD-H). Covers both UI-string keys (`kind:'ui'`)
 * and graph-content translations (`kind:'content'` + `ofNode`/`ofField`), unified
 * in one scheme. `sourceText` is the canonical English (R7); `format` pins the
 * message syntax so imported FormatSimple strings aren't reinterpreted as ICU
 * (R8). Named `TranslationKey` (its per-language values are {@link TranslationUnit}s,
 * not `Translation` — avoids collision with serve's legacy shape, R13).
 */
@linkedShape
export class TranslationKey extends Shape {
  static targetClass = tr.TranslationKey;

  /** Dotted namespace grouping, e.g. "account". */
  @literalProperty({ path: tr.namespace, maxCount: 1 })
  get namespace(): string {
    return '';
  }

  /** The key path, e.g. "account.title". */
  @literalProperty({ path: tr.key, maxCount: 1 })
  get key(): string {
    return '';
  }

  /** Canonical English source string. */
  @literalProperty({ path: tr.sourceText, maxCount: 1 })
  get sourceText(): string {
    return '';
  }

  @literalProperty({ path: tr.description, maxCount: 1 })
  get description(): string {
    return '';
  }

  /** 'ui' (chrome string) | 'content' (graph field). */
  @literalProperty({ path: tr.kind, maxCount: 1 })
  get kind(): string {
    return 'ui';
  }

  /** IRI of the owning Application (translation content is app-scoped, AD-I). */
  @objectProperty({ path: tr.ofApplication, maxCount: 1 })
  get ofApplication(): string {
    return '';
  }

  /** For kind:'content' — the IRI of the translated subject node. */
  @objectProperty({ path: tr.ofNode, maxCount: 1 })
  get ofNode(): string {
    return '';
  }

  /** For kind:'content' — the field/predicate being translated. */
  @literalProperty({ path: tr.ofField, maxCount: 1 })
  get ofField(): string {
    return '';
  }

  /** SHACL node-shape IRI this packaged key accompanies. */
  @objectProperty({ path: tr.ofShape, maxCount: 1 })
  get ofShape(): string {
    return '';
  }

  /** Stable predicate IRI when this key describes one shape property. */
  @objectProperty({ path: tr.ofProperty, maxCount: 1 })
  get ofProperty(): string {
    return '';
  }

  /** Reusable package that supplied the seed value. */
  @literalProperty({ path: tr.fromPackage, maxCount: 1 })
  get fromPackage(): string {
    return '';
  }

  /**
   * True when this app copy of a shape-owned key has been edited locally and
   * should NOT be overwritten by shape-route propagation (AD-N: "never
   * overwrites an app's own override"). Set when the per-app editor changes the
   * source of a key that carries `ofShape`.
   */
  @literalProperty({ path: tr.overridden, maxCount: 1 })
  get overridden(): boolean {
    return false;
  }

  /**
   * The shape's canonical source captured the moment this app first overrode the
   * key — what "clear override" reverts to when no non-overridden sibling copy is
   * available to read the current canonical from (AD-N).
   */
  @literalProperty({ path: tr.shapeSource, maxCount: 1 })
  get shapeSource(): string {
    return '';
  }

  /** Message syntax: 'simple' (FormatSimple) | 'icu'. */
  @literalProperty({ path: tr.format, maxCount: 1 })
  get format(): string {
    return 'simple';
  }

  /** Current immutable source/argument contract. Populated by Plan 018 migration. */
  @objectProperty({ path: tr.currentVersion, maxCount: 1 })
  get currentVersion(): TranslationKeyVersion {
    return undefined as any;
  }

  static list(data: { appId: string }) {
    return Server.call(this, 'listKeys', data);
  }

  /** Plain app-scoped records for authoring UIs; no live Shape crosses RPC. */
  static listEntries(data: { appId: string }) {
    return Server.call(this, 'listEntries', data) as Promise<
      TranslationEntryRecord[]
    >;
  }

  static listVersions(data: { appId: string; key?: string }) {
    return Server.call(this, 'listKeyVersions', data) as Promise<
      TranslationKeyVersionRecord[]
    >;
  }

  // Shape.upsert is the framework's typed graph-update builder. Keep the
  // app-scoped translation RPC separate from that inherited API.
  static upsertKey(data: {
    appId: string;
    key: string;
    sourceText: string;
    namespace?: string;
    description?: string;
    kind?: 'ui' | 'content';
    ofNode?: string;
    ofField?: string;
    ofShape?: string;
    ofProperty?: string;
    fromPackage?: string;
    format?: 'simple' | 'icu';
  }): Promise<{ id: string }> {
    return Server.call(this, 'upsertKey', data);
  }

  static upsertUnit(data: {
    appId: string;
    key: string;
    language: string;
    text: string;
    state?: TranslationState;
    updatedBy?: string;
  }) {
    return Server.call(this, 'upsertUnit', data);
  }

  static getMessages(data: { appId: string; language: string }) {
    return Server.call(this, 'getMessages', data) as Promise<TranslationMessages>;
  }
}
