/**
 * The translation ontology follows the first-party namespace rule:
 * `https://linked.cm/ont/{ontologySlug}/{localName}`, with the package's public
 * slug as both the ontology slug and the prefix label.
 */
import { describe, expect, it } from 'vitest';

import {
  _self,
  cdnTarget,
  TranslationKey,
  TranslationUnit,
} from '../src/ontologies/translation.js';
import data from '../src/data/translation.json';

const NAMESPACE = 'https://linked.cm/ont/translation/';

describe('translation ontology namespace', () => {
  it('mints terms under https://linked.cm/ont/translation/', () => {
    expect(_self.id).toBe(NAMESPACE);
    expect(TranslationKey.id).toBe(`${NAMESPACE}TranslationKey`);
    expect(TranslationUnit.id).toBe(`${NAMESPACE}TranslationUnit`);
    expect(cdnTarget.id).toBe(`${NAMESPACE}cdnTarget`);
  });

  it('uses the package slug as the JSON-LD prefix label', () => {
    expect(data['@context']).toMatchObject({ translation: NAMESPACE });
    expect(data['@context']).not.toHaveProperty('tr');
  });
});
