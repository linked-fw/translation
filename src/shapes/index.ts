// Registers every shape this package defines. Side-effect imports only: a
// consumer (or the host app) can load this one module to get the full set of
// shapes registered, without pulling in components, providers or other exports.
import '../ontologies/translation.register.js';

import './TranslationKey.js';
import './TranslationKeyVersion.js';
import './TranslationRelease.js';
import './TranslationUnit.js';
import './TranslationRevision.js';
import './GlossaryTerm.js';
import './TranslationInventoryOrigin.js';
import './TranslationLanguage.js';
