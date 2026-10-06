/**
 * Shape and package IRIs follow the arch-02 public rule for first-party packages:
 * `https://linked.cm/shape/{publicSlug}/{ShapeName}` and
 * `https://linked.cm/pkg/{publicSlug}`.
 */
import { describe, expect, it } from 'vitest';
import { getPackageUri } from '@_linked/core/shapes/SHACL';

import { packageName } from '../src/package.js';
import { TranslationKey } from '../src/shapes/TranslationKey.js';

describe('translation shape IRIs', () => {
  it('mints the package IRI under https://linked.cm/pkg/', () => {
    expect(getPackageUri(packageName)).toBe('https://linked.cm/pkg/translation');
  });

  it('mints shape IRIs under https://linked.cm/shape/translation/', () => {
    expect(TranslationKey.shape.id).toBe(
      'https://linked.cm/shape/translation/TranslationKey',
    );
  });
});
