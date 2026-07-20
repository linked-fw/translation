// Isomorphic barrel (Plan 014 AD-G): side-effect imports register the ontology
// + shapes into the LINKED tree. Safe on client and server — no backend/Node
// code here (that lives in ./backend.ts). Ontology FIRST, then shapes.
import './ontologies/translation.js';
import './shapes/TranslationKey.js';
import './shapes/TranslationUnit.js';
import './shapes/GlossaryTerm.js';

export { TranslationKey } from './shapes/TranslationKey.js';
export { TranslationUnit } from './shapes/TranslationUnit.js';
export { GlossaryTerm } from './shapes/GlossaryTerm.js';
export { tr } from './ontologies/translation.js';
