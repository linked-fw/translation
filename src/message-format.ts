import {
  isArgumentElement,
  isDateElement,
  isNumberElement,
  isPluralElement,
  isSelectElement,
  isTagElement,
  isTimeElement,
  parse,
  type MessageFormatElement,
} from '@formatjs/icu-messageformat-parser';
import type { MessageFormat } from './core/messages.js';

export type MessageArgumentKind =
  | 'argument'
  | 'number'
  | 'date'
  | 'time'
  | 'select'
  | 'plural'
  | 'selectordinal';

export interface MessageArgument {
  name: string;
  kinds: MessageArgumentKind[];
}

export interface MessageAnalysis {
  valid: boolean;
  arguments: MessageArgument[];
  error?: string;
}

export interface MessageArgumentComparison {
  valid: boolean;
  missing: string[];
  extra: string[];
  typeMismatches: Array<{
    name: string;
    source: MessageArgumentKind[];
    target: MessageArgumentKind[];
  }>;
  sourceError?: string;
  targetError?: string;
}

export interface LegacyPluralSuffix {
  countArgument: string;
  suffixArgument: string;
}

/**
 * FormatSimple remains intentionally looser than ICU identifiers: existing
 * apps may use positional (`{0}`), dotted (`{user.name}`), hyphenated
 * (`{item-count}`), or Unicode (`{名前}`) variable names.
 */
const SIMPLE_ARGUMENT_RE =
  /\{\s*([\p{L}\p{N}_][\p{L}\p{N}\p{M}_.-]*)\s*\}/gu;

function argumentKind(element: MessageFormatElement): MessageArgumentKind | null {
  if (isArgumentElement(element)) return 'argument';
  if (isNumberElement(element)) return 'number';
  if (isDateElement(element)) return 'date';
  if (isTimeElement(element)) return 'time';
  if (isSelectElement(element)) return 'select';
  if (isPluralElement(element)) {
    return element.pluralType === 'ordinal' ? 'selectordinal' : 'plural';
  }
  return null;
}

function collectIcuArguments(
  elements: MessageFormatElement[],
  found: Map<string, Set<MessageArgumentKind>>,
): void {
  for (const element of elements) {
    const kind = argumentKind(element);
    if (kind && 'value' in element) {
      const kinds = found.get(element.value) ?? new Set<MessageArgumentKind>();
      kinds.add(kind);
      found.set(element.value, kinds);
    }
    if (isPluralElement(element) || isSelectElement(element)) {
      for (const option of Object.values(element.options)) {
        collectIcuArguments(option.value, found);
      }
    } else if (isTagElement(element)) {
      collectIcuArguments(element.children, found);
    }
  }
}

const toArguments = (
  found: Map<string, Set<MessageArgumentKind>>,
): MessageArgument[] =>
  [...found.entries()]
    .map(([name, kinds]) => ({ name, kinds: [...kinds].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));

/** Parse the variables a translator must preserve in a simple or ICU message. */
export function analyzeMessage(
  text: string,
  format: MessageFormat = 'simple',
): MessageAnalysis {
  const found = new Map<string, Set<MessageArgumentKind>>();
  if (format === 'simple') {
    for (const match of text.matchAll(SIMPLE_ARGUMENT_RE)) {
      found.set(match[1], new Set(['argument']));
    }
    return { valid: true, arguments: toArguments(found) };
  }

  try {
    collectIcuArguments(
      parse(text, { ignoreTag: true, requiresOtherClause: true }),
      found,
    );
    return { valid: true, arguments: toArguments(found) };
  } catch (cause) {
    return {
      valid: false,
      arguments: [],
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

/**
 * Compare runtime arguments without requiring identical word order or plural
 * categories. Categories legitimately differ by language; variable names and
 * their ICU roles may not.
 */
export function compareMessageArguments(
  source: string,
  target: string,
  format: MessageFormat = 'simple',
): MessageArgumentComparison {
  const sourceAnalysis = analyzeMessage(source, format);
  const targetAnalysis = analyzeMessage(target, format);
  const sourceByName = new Map(
    sourceAnalysis.arguments.map((argument) => [argument.name, argument]),
  );
  const targetByName = new Map(
    targetAnalysis.arguments.map((argument) => [argument.name, argument]),
  );
  const optionalLegacySuffixes =
    format === 'simple'
      ? new Set(
          detectLegacyPluralSuffixes(source).map(
            ({ suffixArgument }) => suffixArgument,
          ),
        )
      : new Set<string>();
  const missing = [...sourceByName.keys()]
    .filter((name) => !targetByName.has(name) && !optionalLegacySuffixes.has(name))
    .sort();
  const extra = [...targetByName.keys()]
    .filter((name) => !sourceByName.has(name))
    .sort();
  const typeMismatches = [...sourceByName.keys()]
    .filter((name) => targetByName.has(name))
    .flatMap((name) => {
      const sourceKinds = sourceByName.get(name)!.kinds;
      const targetKinds = targetByName.get(name)!.kinds;
      return sourceKinds.length === targetKinds.length &&
        sourceKinds.every((kind, index) => kind === targetKinds[index])
        ? []
        : [{ name, source: sourceKinds, target: targetKinds }];
    });

  return {
    valid:
      sourceAnalysis.valid &&
      targetAnalysis.valid &&
      missing.length === 0 &&
      extra.length === 0 &&
      typeMismatches.length === 0,
    missing,
    extra,
    typeMismatches,
    sourceError: sourceAnalysis.error,
    targetError: targetAnalysis.error,
  };
}

/**
 * Detect the legacy English suffix idiom (`{n} mission{s}`). `{s}` is not a
 * plural operator; callers merely pass either "s" or "". Other languages may
 * omit it, and the key should eventually be rewritten as an ICU plural.
 */
export function detectLegacyPluralSuffixes(
  text: string,
): LegacyPluralSuffix[] {
  const countArguments = [
    ...text.matchAll(
      /\{\s*([\p{L}\p{N}_][\p{L}\p{N}\p{M}_.-]*)\s*\}/gu,
    ),
  ].map((match) => match[1]);
  if (countArguments.length < 2) return [];
  const suffixes = [
    ...text.matchAll(
      /[\p{L}\p{N}]\{\s*([\p{L}\p{N}_][\p{L}\p{N}\p{M}_.-]*)\s*\}/gu,
    ),
  ].map((match) => match[1]);
  if (suffixes.length === 0) return [];
  const countArgument = countArguments.find(
    (name) => !suffixes.includes(name),
  );
  if (!countArgument) return [];
  return [...new Set(suffixes)].map((suffixArgument) => ({
    countArgument,
    suffixArgument,
  }));
}
