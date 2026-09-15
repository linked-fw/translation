import { Shape } from '@_linked/core/shapes/Shape';
import { literalProperty, objectProperty } from '@_linked/core/shapes/SHACL';
import { xsd } from '@_linked/core/ontologies/xsd';
import { Server } from '@_linked/server-utils/utils/Server';
import { tr } from '../ontologies/translation.js';
import { linkedShape } from '../package.js';
import type { TranslationReleaseRecord } from '../records.js';

/**
 * Graph metadata for an immutable translation release. Key/language selections
 * live in the content-addressed manifest rather than repeated RDF predicates.
 */
@linkedShape
export class TranslationRelease extends Shape {
  static targetClass = tr.TranslationRelease;

  @objectProperty({ path: tr.ofApplication, maxCount: 1 })
  get ofApplication(): string {
    return '';
  }

  @objectProperty({ path: tr.branch, maxCount: 1 })
  get branch(): string {
    return '';
  }

  @literalProperty({ path: tr.releaseId, maxCount: 1 })
  get releaseId(): string {
    return '';
  }

  @literalProperty({ path: tr.buildId, maxCount: 1 })
  get buildId(): string {
    return '';
  }

  @literalProperty({ path: tr.channel, maxCount: 1 })
  get channel(): string {
    return 'preview';
  }

  @literalProperty({ path: tr.status, maxCount: 1 })
  get status(): string {
    return 'draft';
  }

  @literalProperty({ path: tr.contractSetHash, maxCount: 1 })
  get contractSetHash(): string {
    return '';
  }

  @literalProperty({ path: tr.manifestHash, maxCount: 1 })
  get manifestHash(): string {
    return '';
  }

  @literalProperty({ path: tr.hotfixSequence, datatype: xsd.integer, maxCount: 1 })
  get hotfixSequence(): number {
    return 0;
  }

  @literalProperty({ path: tr.createdAt, datatype: xsd.dateTime, maxCount: 1 })
  get createdAt(): Date {
    return new Date(0);
  }

  @literalProperty({ path: tr.publishedAt, datatype: xsd.dateTime, maxCount: 1 })
  get publishedAt(): Date {
    return new Date(0);
  }

  @literalProperty({ path: tr.supportedUntil, datatype: xsd.dateTime, maxCount: 1 })
  get supportedUntil(): Date {
    return new Date(0);
  }

  /** Canonical JSON summary; the full per-language detail also lives in the manifest. */
  @literalProperty({ path: tr.qualitySummary, maxCount: 1 })
  get qualitySummary(): string {
    return '';
  }

  @objectProperty({ path: tr.supersedes, shape: TranslationRelease, maxCount: 1 })
  get supersedes(): TranslationRelease {
    return undefined as any;
  }

  static list(data: { appId: string }) {
    return Server.call(this, 'listReleases', data) as Promise<
      TranslationReleaseRecord[]
    >;
  }

  static createRelease(
    data: Omit<TranslationReleaseRecord, 'id' | 'createdAt'> & {
      createdAt?: string;
    },
  ) {
    return Server.call(this, 'createRelease', data) as Promise<
      TranslationReleaseRecord
    >;
  }

  static advanceHotfix(data: {
    id: string;
    expectedSequence: number;
    hotfixSequence: number;
    manifestHash: string;
  }) {
    return Server.call(this, 'advanceReleaseHotfix', data) as Promise<
      TranslationReleaseRecord
    >;
  }
}
