/** Isomorphic capability declaration consumed by Create Now and app tooling. */
export const translationCapability = {
  key: 'translation',
  schemaVersion: 1,
  label: 'Translation',
  description:
    'Manage translations for this app across languages — keys, machine translation, and CDN delivery.',
  package: '@_linked/translation',
  shapes: [
    '@_linked/translation:TranslationKey',
    '@_linked/translation:TranslationUnit',
    '@_linked/translation:GlossaryTerm',
  ],
  menu: [{ label: 'Translations', link: '/translations', icon: 'Languages' }],
  requiresMaterialization: true,
} as const;

export default translationCapability;
