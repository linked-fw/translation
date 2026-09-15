import { access, readdir, readFile, realpath } from 'node:fs/promises';
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import {
  extractTranslationKeys,
  syncTranslationKeys,
  translationDeclarationsFromExtractedKeys,
  type ExtractedTranslationKey,
  type TranslationKeySyncOptions,
  type TranslationKeySyncReport,
  type TranslationKeySyncTarget,
} from './key-sync.js';
import {
  manifestTranslationDiscoverySource,
  type TranslationDiscoverySource,
} from './discovery.js';
import { linkedPackageTranslationDiscoverySource } from './linked-discovery.js';

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const IGNORED_DIRECTORIES = new Set([
  '.git',
  'build',
  'coverage',
  'dist',
  'lib',
  'node_modules',
]);

/** Conventional code-canonical manifest for finite dynamic key families. */
export const TRANSLATION_DISCOVERY_MANIFEST_FILE =
  'translation.discovery.json';

/** package.json field pointing at a serialized LINKED translation catalog. */
export const LINKED_TRANSLATION_CATALOG_FIELD =
  'linkedTranslationCatalog';

interface PackageManifest {
  name?: unknown;
  dependencies?: unknown;
  optionalDependencies?: unknown;
  [LINKED_TRANSLATION_CATALOG_FIELD]?: unknown;
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function readOptionalJsonFile(path: string): Promise<unknown | null> {
  try {
    return await readJsonFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function dependencyNames(manifest: PackageManifest): string[] {
  const names = new Set<string>();
  for (const group of [manifest.dependencies, manifest.optionalDependencies]) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) continue;
    for (const name of Object.keys(group)) names.add(name);
  }
  return [...names].sort();
}

async function dependencyDirectory(
  workspaceRoot: string,
  packageDirectory: string,
  dependency: string,
): Promise<string | null> {
  let search = packageDirectory;
  while (true) {
    const candidate = join(search, 'node_modules', ...dependency.split('/'));
    const boundary = relative(workspaceRoot, candidate);
    if (!isAbsolute(boundary) && !boundary.startsWith('..')) {
      try {
        await access(join(candidate, 'package.json'));
        return candidate;
      } catch {
        // Hoisted dependencies may live in a parent node_modules directory.
      }
    }
    if (search === workspaceRoot) return null;
    const parent = dirname(search);
    if (parent === search || relative(workspaceRoot, parent).startsWith('..')) {
      return null;
    }
    search = parent;
  }
}

async function safePackageFile(
  packageDirectory: string,
  file: string,
): Promise<string> {
  const clean = file.trim();
  if (!clean) {
    throw new Error(
      `${LINKED_TRANSLATION_CATALOG_FIELD} must be a non-empty relative path.`,
    );
  }
  const lexicalFile = resolve(packageDirectory, clean);
  const lexicalBoundary = relative(packageDirectory, lexicalFile);
  if (
    isAbsolute(lexicalBoundary) ||
    lexicalBoundary === '..' ||
    lexicalBoundary.startsWith(`..${sep}`)
  ) {
    throw new Error(
      `${LINKED_TRANSLATION_CATALOG_FIELD} must stay inside its package.`,
    );
  }
  const [realPackageDirectory, realFile] = await Promise.all([
    realpath(packageDirectory),
    realpath(lexicalFile),
  ]);
  const boundary = relative(realPackageDirectory, realFile);
  if (
    isAbsolute(boundary) ||
    boundary === '..' ||
    boundary.startsWith(`..${sep}`)
  ) {
    throw new Error(
      `${LINKED_TRANSLATION_CATALOG_FIELD} must stay inside its package.`,
    );
  }
  return realFile;
}

/**
 * Discover serialized app and dependency metadata from one exact workspace.
 *
 * This reads JSON only. Dependency JavaScript is never imported or evaluated.
 * Dynamic keys live in `translation.discovery.json`; reusable LINKED packages
 * opt in through package.json's `linkedTranslationCatalog` relative path.
 */
export async function loadWorkspaceTranslationDiscoverySources(
  root: string,
): Promise<TranslationDiscoverySource[]> {
  const workspaceRoot = resolve(root);
  const sources: TranslationDiscoverySource[] = [];
  const appManifest = await readOptionalJsonFile(
    join(workspaceRoot, TRANSLATION_DISCOVERY_MANIFEST_FILE),
  );
  if (appManifest) {
    sources.push(manifestTranslationDiscoverySource(appManifest));
  }

  const visited = new Set<string>();
  const inspectPackage = async (packageDirectory: string): Promise<void> => {
    const absoluteDirectory = resolve(packageDirectory);
    if (visited.has(absoluteDirectory)) return;
    const raw = await readOptionalJsonFile(
      join(absoluteDirectory, 'package.json'),
    );
    if (!raw) return;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`Invalid package.json in ${absoluteDirectory}.`);
    }
    visited.add(absoluteDirectory);
    const manifest = raw as PackageManifest;
    const catalogFile = manifest[LINKED_TRANSLATION_CATALOG_FIELD];
    if (catalogFile !== undefined) {
      if (typeof catalogFile !== 'string') {
        throw new Error(
          `${LINKED_TRANSLATION_CATALOG_FIELD} in ${absoluteDirectory}/package.json must be a string.`,
        );
      }
      sources.push(
        linkedPackageTranslationDiscoverySource(
          await readFile(
            await safePackageFile(absoluteDirectory, catalogFile),
          ),
        ),
      );
    }
    for (const dependency of dependencyNames(manifest)) {
      const directory = await dependencyDirectory(
        workspaceRoot,
        absoluteDirectory,
        dependency,
      );
      if (directory) await inspectPackage(directory);
    }
  };

  await inspectPackage(workspaceRoot);
  return sources.sort((left, right) => left.name.localeCompare(right.name));
}

export interface ScanTranslationSourceOptions {
  extensions?: Iterable<string>;
  ignoredDirectories?: Iterable<string>;
}

/** Recursively extract static translation keys from an application's source tree. */
export async function scanTranslationSourceTree(
  root: string,
  options: ScanTranslationSourceOptions = {},
): Promise<ExtractedTranslationKey[]> {
  const absoluteRoot = resolve(root);
  const extensions = new Set(options.extensions ?? SOURCE_EXTENSIONS);
  const ignored = new Set(options.ignoredDirectories ?? IGNORED_DIRECTORIES);
  const files: string[] = [];

  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) await walk(path);
      } else if (entry.isFile() && extensions.has(extname(entry.name))) {
        files.push(path);
      }
    }
  };

  await walk(absoluteRoot);
  const extracted = await Promise.all(
    files.map(async (file) =>
      extractTranslationKeys(await readFile(file, 'utf8'), relative(absoluteRoot, file)),
    ),
  );
  return extracted.flat();
}

/** Portable discovery adapter for an ordinary application's source tree. */
export function sourceTreeTranslationDiscoverySource(
  root: string,
  options: ScanTranslationSourceOptions = {},
): TranslationDiscoverySource {
  return {
    name: `source-tree:${resolve(root)}`,
    async *discover() {
      const extracted = await scanTranslationSourceTree(root, options);
      yield* translationDeclarationsFromExtractedKeys(extracted);
    },
  };
}

export interface SyncTranslationSourceTreeOptions
  extends ScanTranslationSourceOptions,
    TranslationKeySyncOptions {
  root: string;
  appId: string;
  target: TranslationKeySyncTarget;
}

/** Scan an app source tree and report or apply its keys through a provider adapter. */
export async function syncTranslationSourceTree({
  root,
  appId,
  target,
  dryRun,
  extensions,
  ignoredDirectories,
}: SyncTranslationSourceTreeOptions): Promise<TranslationKeySyncReport> {
  const extracted = await scanTranslationSourceTree(root, { extensions, ignoredDirectories });
  return syncTranslationKeys(target, appId, extracted, { dryRun });
}
