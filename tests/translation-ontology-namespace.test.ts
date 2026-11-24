/**
 * The translation ontology follows the first-party namespace rule:
 * `https://linked.cm/ont/{name}/{localName}`, with the package's public
 * slug as both the ontology's name and the prefix its data suggests.
 */
import { describe, expect, it } from 'vitest';

import {
  _self,
  cdnTarget,
  ofResource,
  tr,
  TranslationKey,
  TranslationUnit,
} from '../src/ontologies/translation.js';
import { Prefix } from '@_linked/core/utils/Prefix';
import { suggestedPrefixes } from '@_linked/core/utils/Package';
import '../src/ontologies/index.js';

const NAMESPACE = 'https://linked.cm/ont/translation/';

describe('translation ontology namespace', () => {
  it('mints terms under https://linked.cm/ont/translation/', () => {
    expect(_self.id).toBe(NAMESPACE);
    expect(TranslationKey.id).toBe(`${NAMESPACE}TranslationKey`);
    expect(TranslationUnit.id).toBe(`${NAMESPACE}TranslationUnit`);
    expect(cdnTarget.id).toBe(`${NAMESPACE}cdnTarget`);
  });

  it('declares ofResource for keys owned by an arbitrary semantic resource', () => {
    expect(ofResource.id).toBe(`${NAMESPACE}ofResource`);
    expect(tr.ofResource).toBe(ofResource);
  });

  it('suggests the package slug as its prefix and registers none', () => {
    expect(suggestedPrefixes().filter((p) => p.packageName === '@_linked/translation')).toEqual([
      { packageName: '@_linked/translation', name: 'translation', namespace: NAMESPACE, prefix: 'translation' },
    ]);
    expect(Prefix.getFullURI('translation')).toBeUndefined();
    expect(Prefix.toPrefixed(TranslationKey.id, { translation: NAMESPACE })).toBe('translation:TranslationKey');
  });
});
