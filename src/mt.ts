/**
 * Machine-translation provider registry (Plan 014 AD-L / Plan 017 Slice B).
 * Providers implement one method — translate a batch of UI strings — and
 * register by key ('claude', 'deepl', …). Resolution is PER TARGET LANGUAGE
 * with a fallback chain: not every provider covers every language (DeepL has
 * no Swahili or Urdu), so the preferred provider is used where it supports
 * the target and the chain falls through otherwise. Pure module: no I/O, no
 * SDK imports — concrete providers live with the host (Create Now) and are
 * registered at boot.
 */
import {
  analyzeMessage,
  compareMessageArguments,
} from './message-format.js';
import type { MessageFormat } from './core/messages.js';

export interface MtItem {
  key: string;
  sourceText: string;
  /** Authoring context shown to the translator/model. */
  description?: string;
  format?: 'simple' | 'icu';
}

export interface MtGlossaryEntry {
  term: string;
  /** prefer (default) = translate as `translation`; keep = do-not-translate; forbid = never use. */
  termType?: 'prefer' | 'require' | 'keep' | 'forbid';
  /** Preferred translation (prefer entries); empty/undefined = keep the term as-is. */
  translation?: string;
  /** Replacement wording (forbid entries). */
  useInstead?: string;
  /** Target language this applies to; empty = all languages. */
  language?: string;
  /** Exact-casing matching (proper nouns / brand styling). */
  caseSensitive?: boolean;
  description?: string;
}

/** Register/tone controls (Plan 017 §7.4b) — NOT sampling temperature. */
export interface MtStyle {
  formality?: 'formal' | 'informal';
  /** Free-text tone guidance, e.g. "friendly, energetic, no bureaucratese". */
  note?: string;
}

/** An established translation the provider should stay consistent with. */
export interface MtReference {
  sourceText: string;
  text: string;
}

export interface MtBatchRequest {
  sourceLanguage: string;
  targetLanguage: string;
  items: MtItem[];
  glossary: MtGlossaryEntry[];
  style?: MtStyle;
  /** Translation-memory context: reviewed units for consistency (Plan 017 §7.4c). */
  references?: MtReference[];
}

export interface MtBatchResult {
  key: string;
  text: string;
}

export interface TranslationMtProvider {
  readonly key: string;
  /** Absent ⇒ the provider claims every language. */
  supportsLanguage?(language: string): boolean;
  translateBatch(request: MtBatchRequest): Promise<MtBatchResult[]>;
}

const providers = new Map<string, TranslationMtProvider>();

export function registerMtProvider(provider: TranslationMtProvider): void {
  providers.set(provider.key, provider);
}

export function getMtProvider(key: string): TranslationMtProvider | undefined {
  return providers.get(key);
}

export function listMtProviders(): TranslationMtProvider[] {
  return [...providers.values()];
}

/** Test seam. */
export function clearMtProviders(): void {
  providers.clear();
}

/**
 * Ordered provider chain for one target language: the preferred provider
 * first when it exists AND supports the language, then every other provider
 * that supports it, registration order.
 */
export function resolveMtProviders(
  targetLanguage: string,
  preferred?: string,
): TranslationMtProvider[] {
  const supports = (p: TranslationMtProvider) =>
    !p.supportsLanguage || p.supportsLanguage(targetLanguage);
  const chain = listMtProviders().filter(supports);
  if (!preferred) return chain;
  const first = chain.find((p) => p.key === preferred);
  if (!first) return chain;
  return [first, ...chain.filter((p) => p !== first)];
}

/** Unique `{placeholder}` tokens in a message, sorted for set comparison. */
export function extractPlaceholders(
  text: string,
  format: MessageFormat = 'simple',
): string[] {
  return analyzeMessage(text, format).arguments.map(({ name }) => name);
}

/**
 * A translation is only usable if it preserves the source's placeholder SET
 * exactly — a dropped or renamed `{param}` breaks interpolation at runtime.
 */
export function placeholdersIntact(
  source: string,
  translated: string,
  format: MessageFormat = 'simple',
): boolean {
  return compareMessageArguments(source, translated, format).valid;
}

/** Glossary entries applying to one target language (global + language-specific). */
export function glossaryForLanguage(
  glossary: MtGlossaryEntry[],
  language: string,
): MtGlossaryEntry[] {
  return glossary.filter((g) => !g.language || g.language === language);
}

export function chunkItems<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be >= 1');
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Resolve the formality for one language from the encoded config entries
 * ("formal" = app default; "de:informal" = per-language override; override wins).
 */
export function formalityForLanguage(
  entries: string[],
  language: string,
): 'formal' | 'informal' | undefined {
  let result: 'formal' | 'informal' | undefined;
  for (const entry of entries ?? []) {
    const i = entry.indexOf(':');
    const value = i === -1 ? entry : entry.slice(i + 1);
    if (value !== 'formal' && value !== 'informal') continue;
    if (i === -1) {
      if (!result) result = value;
    } else if (entry.slice(0, i) === language) {
      return value;
    }
  }
  return result;
}

// ── Consistency (Plan 017 §7.4c) ────────────────────────────────────────

/** Minimal entry view the consistency helpers need (client-safe). */
export interface ConsistencyEntry {
  key: string;
  namespace?: string;
  sourceText: string;
  format?: 'simple' | 'icu';
  units: Record<string, { text: string; state: string } | undefined>;
}

/** Identical English source translated DIFFERENTLY within one language. */
export interface ConsistencyConflict {
  sourceText: string;
  language: string;
  /** One entry per distinct translation: the text + the keys carrying it. */
  variants: Array<{ text: string; keys: string[] }>;
}

/**
 * Find keys whose IDENTICAL source text has diverging translations in a
 * language — the core "same words, same translation" consistency check.
 * Empty/untranslated units are ignored; whitespace-trimmed comparison.
 */
export function findInconsistentTranslations(
  entries: ConsistencyEntry[],
  language: string,
): ConsistencyConflict[] {
  const bySource = new Map<string, Map<string, string[]>>();
  for (const entry of entries) {
    const source = entry.sourceText.trim();
    const text = entry.units[language]?.text?.trim();
    if (!source || !text) continue;
    const variants = bySource.get(source) ?? new Map<string, string[]>();
    variants.set(text, [...(variants.get(text) ?? []), entry.key]);
    bySource.set(source, variants);
  }
  const conflicts: ConsistencyConflict[] = [];
  for (const [sourceText, variants] of bySource) {
    if (variants.size < 2) continue;
    conflicts.push({
      sourceText,
      language,
      variants: [...variants].map(([text, keys]) => ({ text, keys: keys.sort() })),
    });
  }
  return conflicts.sort((a, b) => a.sourceText.localeCompare(b.sourceText));
}

/**
 * Pick reviewed units as translation-memory REFERENCES for an MT batch:
 * same-namespace reviewed translations first (shared vocabulary), then the
 * shortest reviewed units overall (vocabulary-dense). Deterministic.
 */
export function pickReferenceUnits(
  entries: ConsistencyEntry[],
  language: string,
  batchNamespaces: string[],
  max = 20,
): MtReference[] {
  const namespaces = new Set(batchNamespaces);
  const reviewed = entries
    .map((entry) => ({
      namespace: entry.namespace ?? '',
      sourceText: entry.sourceText.trim(),
      unit: entry.units[language],
    }))
    .filter(
      (row) =>
        row.sourceText &&
        row.unit?.state === 'reviewed' &&
        row.unit.text.trim(),
    );
  const score = (row: (typeof reviewed)[number]) =>
    (namespaces.has(row.namespace) ? 0 : 100000) + row.sourceText.length;
  return reviewed
    .sort((a, b) => score(a) - score(b) || a.sourceText.localeCompare(b.sourceText))
    .slice(0, max)
    .map((row) => ({ sourceText: row.sourceText, text: row.unit!.text.trim() }));
}
