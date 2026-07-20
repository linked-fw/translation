import { Shape } from '@_linked/core/shapes/Shape';
import { literalProperty, objectProperty } from '@_linked/core/shapes/SHACL';
import { Server } from '@_linked/server-utils/utils/Server';
import { tr } from '../ontologies/translation.js';
import { linkedShape } from '../package.js';

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

  /** Message syntax: 'simple' (FormatSimple) | 'icu'. */
  @literalProperty({ path: tr.format, maxCount: 1 })
  get format(): string {
    return 'simple';
  }

  static list(data: { appId: string }) {
    return Server.call(this, 'listKeys', data);
  }

  static upsert(data: {
    appId: string;
    key: string;
    sourceText: string;
    namespace?: string;
    description?: string;
    kind?: 'ui' | 'content';
    ofNode?: string;
    ofField?: string;
    format?: 'simple' | 'icu';
  }) {
    return Server.call(this, 'upsertKey', data);
  }

  static upsertUnit(data: {
    appId: string;
    key: string;
    language: string;
    text: string;
    state?: 'untranslated' | 'machine' | 'reviewed' | 'stale';
    updatedBy?: string;
  }) {
    return Server.call(this, 'upsertUnit', data);
  }

  static getMessages(data: { appId: string; language: string }) {
    return Server.call(this, 'getMessages', data) as Promise<Record<string, string>>;
  }
}
