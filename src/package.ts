import { linkedPackage } from '@_linked/core/utils/Package';

// Reusable LINKED translation package. Uses a HOST-NEUTRAL identifier root
// (NOT CN's id.create.now), so the shape/ontology IRIs baked into every app's
// dataset stay stable when this package is later extracted to its own repo
// (`@_linked/translation` / `@semantu/translation`) — a move, not a rewrite
// (Plan 014 AD-G). R14: confirm ownership of `id.linked.cm` before seeding real
// data under these IRIs; changing the baseUri afterwards means re-materializing.
export const {
  linkedShape,
  linkedUtil,
  linkedOntology,
  registerPackageExport,
  packageExports,
  packageName,
  getPackageShape,
} = linkedPackage('@_linked/translation', {
  baseUri: 'https://id.linked.cm/translation/',
});
