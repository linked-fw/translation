/**
 * Translation quality CHECKS engine (Plan 017 B2-1). One pure function turns
 * entries + the termbase into findings; the same engine runs live in the
 * Studio (inline badges + Checks tab), post-MT (reject bad drafts before they
 * are saved), and at import. Enforcement philosophy (ratified 2026-07-23):
 * warn everywhere, gate only at publish — findings never block a save.
 */
import type { GlossaryTermRecord, TranslationEntryRecord } from './records.js';
import { findInconsistentTranslations, type ConsistencyEntry } from './mt.js';
import {
  compareMessageArguments,
  detectLegacyPluralSuffixes,
} from './message-format.js';

export type CheckSeverity = 'error' | 'warning';

export interface CheckFinding {
  key: string;
  language: string;
  /** placeholder-integrity | term-keep | term-prefer | term-required | term-forbid | source-divergence */
  rule: string;
  severity: CheckSeverity;
  message: string;
  /** A concrete replacement text or wording hint, when one exists. */
  suggestion?: string;
}

export type TermHarvestReason = 'repeated' | 'capitalized' | 'untranslated';

export interface TermHarvestCandidate {
  term: string;
  occurrences: number;
  keys: string[];
  languages: string[];
  reasons: TermHarvestReason[];
  suggestedType: 'prefer' | 'keep';
}

const HARVEST_STOP_WORDS = new Set([
  'and',
  'are',
  'but',
  'for',
  'from',
  'has',
  'have',
  'into',
  'not',
  'that',
  'the',
  'their',
  'this',
  'was',
  'were',
  'will',
  'with',
  'you',
  'your',
]);

interface HarvestToken {
  value: string;
  normalized: string;
  capitalized: boolean;
}

function harvestTokens(text: string): HarvestToken[] {
  const matches = [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’.-]*/gu)];
  return matches.flatMap((match, index) => {
    const value = match[0].replace(/[.'’-]+$/u, '');
    const normalized = value.toLocaleLowerCase();
    if (
      value.length < 3 ||
      HARVEST_STOP_WORDS.has(normalized) ||
      /^\d+$/u.test(value)
    ) {
      return [];
    }
    const first = value[0];
    const capitalized =
      (index > 0 &&
        first === first.toLocaleUpperCase() &&
        first !== first.toLocaleLowerCase()) ||
      /^\p{Lu}{2,}[\p{Lu}\p{N}-]*$/u.test(value);
    return [{ value, normalized, capitalized }];
  });
}

/**
 * Mine review candidates from source catalogs. This is intentionally
 * conservative and pure: it suggests repeated terms, likely proper names,
 * and source words that survive unchanged in translations. A human still
 * chooses the rule and saves the term.
 */
export function harvestTermCandidates(
  entries: TranslationEntryRecord[],
  languages: string[],
  termbase: GlossaryTermRecord[] = []
): TermHarvestCandidate[] {
  const existing = new Set(
    termbase.map((entry) => entry.term.toLocaleLowerCase())
  );
  const aggregate = new Map<
    string,
    {
      display: string;
      occurrences: number;
      keys: Set<string>;
      capitalizedKeys: Set<string>;
      untranslatedLanguages: Set<string>;
    }
  >();

  for (const entry of entries) {
    const tokens = harvestTokens(entry.sourceText);
    for (const token of tokens) {
      const value = aggregate.get(token.normalized) ?? {
        display: token.value,
        occurrences: 0,
        keys: new Set<string>(),
        capitalizedKeys: new Set<string>(),
        untranslatedLanguages: new Set<string>(),
      };
      value.occurrences++;
      value.keys.add(entry.key);
      if (token.capitalized) {
        value.display = token.value;
        value.capitalizedKeys.add(entry.key);
      }
      for (const language of languages) {
        const translated = entry.units[language]?.text;
        if (translated && containsTerm(translated, token.value, true)) {
          value.untranslatedLanguages.add(language);
        }
      }
      aggregate.set(token.normalized, value);
    }
  }

  return [...aggregate.entries()]
    .flatMap(([normalized, value]): TermHarvestCandidate[] => {
      if (existing.has(normalized)) return [];
      const repeated = value.keys.size >= 3;
      const capitalized = value.capitalizedKeys.size >= 2;
      const untranslated = value.untranslatedLanguages.size > 0;
      if (!repeated && !capitalized && !untranslated) return [];
      const reasons: TermHarvestReason[] = [];
      if (repeated) reasons.push('repeated');
      if (capitalized) reasons.push('capitalized');
      if (untranslated) reasons.push('untranslated');
      return [
        {
          term: value.display,
          occurrences: value.occurrences,
          keys: [...value.keys].sort(),
          languages: [...value.untranslatedLanguages].sort(),
          reasons,
          suggestedType: capitalized || untranslated ? 'keep' : 'prefer',
        },
      ];
    })
    .sort(
      (left, right) =>
        right.keys.length - left.keys.length ||
        right.reasons.length - left.reasons.length ||
        left.term.localeCompare(right.term)
    );
}

/** Escape a literal for embedding in a RegExp. */
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whole-word-ish containment test. Word boundaries only apply when the term
 * starts/ends with word characters (so "e.V." or "#tag" still match), and
 * matching is Unicode-aware.
 */
export function containsTerm(
  text: string,
  term: string,
  caseSensitive = false,
  locale?: string,
): boolean {
  // Unicode regex folding alone does not handle Turkish dotted/dotless I.
  // Only target text uses its locale; an English source still uses English
  // matching even when the translation is Turkish.
  if (!caseSensitive && locale) {
    try {
      text = text.toLocaleLowerCase(locale);
      term = term.toLocaleLowerCase(locale);
    } catch {
      // Private/custom language tags can be valid application identifiers
      // without being supported by the host's locale implementation.
      text = text.toLowerCase();
      term = term.toLowerCase();
    }
  }
  // Chinese and Japanese phrases routinely touch other letters without spaces.
  // Requiring whitespace-like boundaries would reject valid terms such as 合一.
  const unspaced =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(term);
  const boundedStart =
    !unspaced && /^[\p{L}\p{N}]/u.test(term) ? '(?<![\\p{L}\\p{N}])' : '';
  const boundedEnd =
    !unspaced && /[\p{L}\p{N}]$/u.test(term) ? '(?![\\p{L}\\p{N}])' : '';
  const re = new RegExp(
    `${boundedStart}${escapeRe(term)}${boundedEnd}`,
    caseSensitive ? 'u' : 'iu'
  );
  return re.test(text);
}

const forLanguage = (termbase: GlossaryTermRecord[], language: string) =>
  termbase.filter((t) => t.term && (!t.language || t.language === language));

/**
 * Termbase violations for ONE translated text. Exported separately so the
 * post-MT guard can reject a draft with the same rules the Studio shows.
 */
export function termbaseViolations(
  sourceText: string,
  translatedText: string,
  termbase: GlossaryTermRecord[],
  language: string
): Array<Pick<CheckFinding, 'rule' | 'severity' | 'message' | 'suggestion'>> {
  const findings: Array<
    Pick<CheckFinding, 'rule' | 'severity' | 'message' | 'suggestion'>
  > = [];
  for (const entry of forLanguage(termbase, language)) {
    if (entry.termType === 'keep') {
      // A keep-term appearing in the source must survive VERBATIM (exact
      // casing — that's the point of keep: proper nouns, brand styling,
      // stay-one-language words).
      if (
        containsTerm(sourceText, entry.term, entry.caseSensitive ?? false) &&
        !containsTerm(translatedText, entry.term, true)
      ) {
        findings.push({
          rule: 'term-keep',
          severity: 'error',
          message: `“${entry.term}” must stay exactly as written.`,
          suggestion: entry.term,
        });
      }
    } else if (entry.termType === 'forbid') {
      if (
        containsTerm(translatedText, entry.term, entry.caseSensitive ?? false, language)
      ) {
        findings.push({
          rule: 'term-forbid',
          severity: 'error',
          message: entry.useInstead
            ? `“${entry.term}” is not allowed — use “${entry.useInstead}”.`
            : `“${entry.term}” is not allowed here.`,
          suggestion: entry.useInstead,
        });
      }
    } else {
      // Prefer remains advisory. Require is a source-scoped contract: it
      // prevents two distinct concepts from collapsing into the same label.
      if (
        entry.translation &&
        containsTerm(sourceText, entry.term, entry.caseSensitive ?? false) &&
        !containsTerm(
          translatedText,
          entry.translation,
          entry.caseSensitive ?? false,
          language,
        )
      ) {
        findings.push({
          rule: entry.termType === 'require' ? 'term-required' : 'term-prefer',
          severity: entry.termType === 'require' ? 'error' : 'warning',
          message:
            entry.termType === 'require'
              ? `“${entry.term}” must be translated as “${entry.translation}”.`
              : `“${entry.term}” is preferably translated as “${entry.translation}”.`,
          suggestion: entry.translation,
        });
      }
    }
  }
  return findings;
}

/** True when a draft breaks an ERROR-severity termbase rule (post-MT gate). */
export function violatesTermbase(
  sourceText: string,
  translatedText: string,
  termbase: GlossaryTermRecord[],
  language: string
): boolean {
  return termbaseViolations(
    sourceText,
    translatedText,
    termbase,
    language
  ).some((f) => f.severity === 'error');
}

/**
 * Run every check for one language across the app's entries. Pure and
 * client-safe — the Studio computes findings locally from data it already has.
 */
export function runChecks(
  entries: ConsistencyEntry[],
  language: string,
  termbase: GlossaryTermRecord[] = []
): CheckFinding[] {
  const findings: CheckFinding[] = [];
  for (const entry of entries) {
    const text = entry.units[language]?.text?.trim();
    if (!text || !entry.sourceText.trim()) continue;
    const format = entry.format === 'icu' ? 'icu' : 'simple';
    const comparison = compareMessageArguments(entry.sourceText, text, format);
    if (comparison.sourceError || comparison.targetError) {
      findings.push({
        key: entry.key,
        language,
        rule: 'message-syntax',
        severity: 'error',
        message: comparison.sourceError
          ? `The source ${format.toUpperCase()} message is invalid: ${
              comparison.sourceError
            }`
          : `The translation ${format.toUpperCase()} message is invalid: ${
              comparison.targetError
            }`,
      });
    } else if (!comparison.valid) {
      const details = [
        comparison.missing.length
          ? `Missing ${comparison.missing
              .map((name) => `{${name}}`)
              .join(', ')}.`
          : '',
        comparison.extra.length
          ? `Unexpected ${comparison.extra
              .map((name) => `{${name}}`)
              .join(', ')}.`
          : '',
        ...comparison.typeMismatches.map(
          ({ name, source, target }) =>
            `{${name}} changes from ${source.join('/')} to ${target.join('/')}.`
        ),
      ].filter(Boolean);
      findings.push({
        key: entry.key,
        language,
        rule: 'placeholder-integrity',
        severity: 'error',
        message: details.join(' '),
      });
    }
    const legacyPlural = detectLegacyPluralSuffixes(entry.sourceText);
    if (format === 'simple' && legacyPlural.length > 0) {
      findings.push({
        key: entry.key,
        language,
        rule: 'legacy-plural-suffix',
        severity: 'warning',
        message: `${legacyPlural
          .map(({ suffixArgument }) => `{${suffixArgument}}`)
          .join(
            ', '
          )} is an English suffix variable, not pluralization. It may be omitted in this translation; migrate this key to an ICU plural for locale-aware grammar.`,
      });
    }
    for (const violation of termbaseViolations(
      entry.sourceText,
      text,
      termbase,
      language
    )) {
      findings.push({ key: entry.key, language, ...violation });
    }
  }
  // Identical source ⇒ divergent target. Suggest the majority variant.
  for (const conflict of findInconsistentTranslations(entries, language)) {
    const majority = [...conflict.variants].sort(
      (a, b) => b.keys.length - a.keys.length || a.text.localeCompare(b.text)
    )[0];
    for (const variant of conflict.variants) {
      if (variant === majority) continue;
      for (const key of variant.keys) {
        findings.push({
          key,
          language,
          rule: 'source-divergence',
          severity: 'warning',
          message: `“${conflict.sourceText}” is translated “${
            variant.text
          }” here but “${majority.text}” on ${majority.keys.length} other key${
            majority.keys.length === 1 ? '' : 's'
          }.`,
          suggestion: majority.text,
        });
      }
    }
  }
  return findings;
}

/** Findings grouped per key for inline cell badges. */
export function findingsByKey(
  findings: CheckFinding[]
): Map<string, CheckFinding[]> {
  const map = new Map<string, CheckFinding[]>();
  for (const finding of findings) {
    map.set(finding.key, [...(map.get(finding.key) ?? []), finding]);
  }
  return map;
}
