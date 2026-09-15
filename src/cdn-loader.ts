import {
  defineLanguage,
  validateLanguageDefinitions,
  type TranslationLanguageDefinition,
} from './languages.js';
/**
 * `loadMessages` factory for the CDN delivery cascade (Plan 016 P2.4, AD-J/AD-K).
 * SIMPLE-POINTER mode (the ratified default): fetch `${base}/{lang}.json` from
 * the published CDN — changing `base` (an app's `tr:cdnTarget`) repoints at
 * different cloud files with no call-site change, exactly the Tolgee model.
 * `bundledPath` (same-origin bundled copy) and `devApi` (e.g. the `getMessages`
 * RPC for live dev editing) are optional fallbacks, tried in the order given.
 * Any source that yields a non-empty map wins; all-empty ⇒ `{}` and the client
 * keeps its inline English defaults. Never throws.
 *
 * Portable (no CN import): the caller wires `base`/`devApi` for its environment.
 */
import type { TranslationMessages } from './core/messages.js';
import { sha256Hex } from './key-version.js';
import {
  applyCatalogPatches,
  type TranslationBuildDescriptor,
  type TranslationCatalogPatch,
  type TranslationReleaseManifest,
} from './release.js';

export interface CdnLoaderConfig {
  /** Published CDN base — `${base}/{lang}.json`. The repoint knob. Omit to skip. */
  base?: string;
  /** Same-origin bundled base — `${bundledPath}/{lang}.json`. Omit to skip. */
  bundledPath?: string;
  /** Last-resort loader (e.g. a live backend RPC). Omit to skip. */
  devApi?: (language: string) => Promise<TranslationMessages>;
  /** Injectable for tests / non-DOM runtimes. */
  fetchImpl?: typeof fetch;
}

function isNonEmptyMap(v: unknown): v is TranslationMessages {
  return !!v && typeof v === 'object' && Object.keys(v as object).length > 0;
}

export function createCdnLoader(
  config: CdnLoaderConfig
): (language: string) => Promise<TranslationMessages> {
  const doFetch =
    config.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  const base = config.base?.replace(/\/+$/, '');
  const bundled = config.bundledPath?.replace(/\/+$/, '');

  const fetchJson = async (
    url: string
  ): Promise<TranslationMessages | null> => {
    if (!doFetch) return null;
    try {
      const res = await doFetch(url);
      if (!res.ok) return null;
      return (await res.json()) as TranslationMessages;
    } catch {
      return null;
    }
  };

  return async (language: string): Promise<TranslationMessages> => {
    const sources: Array<() => Promise<TranslationMessages | null>> = [];
    if (base) sources.push(() => fetchJson(`${base}/${language}.json`));
    if (bundled) sources.push(() => fetchJson(`${bundled}/${language}.json`));
    if (config.devApi)
      sources.push(async () => {
        try {
          return await config.devApi!(language);
        } catch {
          return null;
        }
      });

    for (const source of sources) {
      const result = await source();
      if (isNonEmptyMap(result)) return result;
    }
    return {};
  };
}

export interface ReleaseLoaderConfig {
  bundledPath: string;
  descriptor:
    | TranslationBuildDescriptor
    | (() => Promise<TranslationBuildDescriptor | null>);
  fetchImpl?: typeof fetch;
  devApi?: (language: string) => Promise<TranslationMessages>;
}

function resolveReleaseUrl(url: string, manifestUrl: string): string {
  try {
    return new URL(url, manifestUrl).toString();
  } catch {
    return url;
  }
}

function isReleaseManifest(
  value: unknown
): value is TranslationReleaseManifest {
  const manifest = value as Partial<TranslationReleaseManifest> | undefined;
  return (
    manifest?.schemaVersion === 2 &&
    typeof manifest.releaseId === 'string' &&
    typeof manifest.contractSetHash === 'string' &&
    !!manifest.keyVersions &&
    typeof manifest.keyVersions === 'object' &&
    !!manifest.languages &&
    typeof manifest.languages === 'object'
  );
}

/**
 * Schema-v2 release loader. Bundled messages always win the first render;
 * compatible immutable CDN objects fetched in the background become visible
 * only on the next call for that language.
 */
export function createReleaseLoader(
  config: ReleaseLoaderConfig
): (language: string) => Promise<TranslationMessages> {
  const doFetch =
    config.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  const bundled = config.bundledPath.replace(/\/+$/, '');
  const objectCache = new Map<string, unknown>();
  const pending = new Map<string, Promise<TranslationMessages | null>>();
  const requested = new Set<string>();
  let descriptorPromise: Promise<TranslationBuildDescriptor | null> | undefined;
  const getDescriptor = () =>
    (descriptorPromise ??=
      typeof config.descriptor === 'function'
        ? config.descriptor()
        : Promise.resolve(config.descriptor));

  const fetchText = async (url: string): Promise<string | null> => {
    if (!doFetch) return null;
    try {
      const response = await doFetch(url);
      return response.ok ? await response.text() : null;
    } catch {
      return null;
    }
  };

  const fetchMessages = async (
    url: string
  ): Promise<TranslationMessages | null> => {
    const text = await fetchText(url);
    if (text === null) return null;
    try {
      const parsed = JSON.parse(text);
      return isNonEmptyMap(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const fetchHashed = async <T>(
    url: string,
    hash: string
  ): Promise<T | null> => {
    if (objectCache.has(hash)) return objectCache.get(hash) as T;
    const text = await fetchText(url);
    if (text === null || (await sha256Hex(text)) !== hash) return null;
    try {
      const parsed = JSON.parse(text) as T;
      objectCache.set(hash, parsed);
      return parsed;
    } catch {
      return null;
    }
  };

  const fetchReleaseLanguage = async (
    language: string
  ): Promise<TranslationMessages | null> => {
    const descriptor = await getDescriptor();
    if (!descriptor) return null;
    const manifestText = await fetchText(descriptor.manifestUrl);
    if (manifestText === null) return null;
    let manifest: unknown;
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      return null;
    }
    if (
      !isReleaseManifest(manifest) ||
      manifest.releaseId !== descriptor.releaseId ||
      manifest.contractSetHash !== descriptor.contractSetHash
    ) {
      return null;
    }
    const lane = manifest.languages[language];
    if (!lane) return null;
    const base = await fetchHashed<TranslationMessages>(
      resolveReleaseUrl(lane.base.url, descriptor.manifestUrl),
      lane.base.hash
    );
    if (!base) return null;
    const patches: TranslationCatalogPatch[] = [];
    for (const patch of [...lane.patches].sort(
      (left, right) => left.sequence - right.sequence
    )) {
      const body = await fetchHashed<TranslationCatalogPatch>(
        resolveReleaseUrl(patch.url, descriptor.manifestUrl),
        patch.hash
      );
      if (!body) return null;
      patches.push(body);
    }
    return applyCatalogPatches(base, patches);
  };

  return async (language: string): Promise<TranslationMessages> => {
    const bundledMessages = await fetchMessages(`${bundled}/${language}.json`);
    const existing = pending.get(language);
    if (requested.has(language) && existing) {
      const released = await existing;
      return released ?? bundledMessages ?? {};
    }
    requested.add(language);
    const background = fetchReleaseLanguage(language);
    pending.set(language, background);
    if (bundledMessages) {
      void background.catch(() => null);
      return bundledMessages;
    }
    const released = await background;
    if (released) return released;
    if (config.devApi) {
      try {
        return await config.devApi(language);
      } catch {
        // Preserve the empty fallback contract.
      }
    }
    return {};
  };
}

/** Fetch public language resources independently of a compiled application. */
export function createCdnLanguageLoader(
  config: Pick<CdnLoaderConfig, 'base' | 'fetchImpl'>
): () => Promise<TranslationLanguageDefinition[]> {
  return async () => {
    if (!config.base) throw new Error('A translation CDN base is required.');
    const response = await (config.fetchImpl ?? fetch)(
      `${config.base.replace(/\/+$/, '')}/languages.json`
    );
    if (!response.ok)
      throw new Error(`Language catalog HTTP ${response.status}`);
    const catalog = await response.json();
    if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.languages))
      throw new Error('Invalid language catalog.');
    const definitions = catalog.languages.map(
      (item: TranslationLanguageDefinition) => defineLanguage(item.code, item)
    );
    validateLanguageDefinitions(definitions);
    return definitions;
  };
}
