import { linkedPackage } from '@_linked/core/utils/Package';

// First-party LINKED package: no `baseUri`, so core's default root applies and
// IRIs follow the public rule — shapes `https://linked.cm/shape/translation/{ShapeName}`,
// package `https://linked.cm/pkg/translation` (the public community rule).
export const {
  linkedShape,
  linkedUtil,
  registerOntologies,
  registerPackageExport,
  packageExports,
  packageName,
  getPackageShape,
} = linkedPackage('@_linked/translation');
