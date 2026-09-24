#!/usr/bin/env node
/**
 * Assert every advertised subpath has compiled output behind it.
 *
 * This package's exports map ends in a `./*` wildcard, which resolves any subpath a consumer
 * asks for — including ones with no emitted .js. TypeScript will not catch that, and neither
 * will the test suite, because both resolve through the `development` condition into src/.
 * A consumer installing from the registry resolves through `import` into lib/, and only then
 * does a missing module surface. That is the failure that shipped nine broken subpaths in
 * shape-ui.
 *
 * Two sources are checked:
 *   - the explicit keys of the exports map (minus the wildcards), and
 *   - scripts/consumer-subpaths.txt, the specifiers Create Now actually imports.
 *
 * Run after `npm run build`. Exits non-zero listing every subpath with no lib/ output.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const exportsMap = pkg.exports ?? {};

const fromExports = Object.keys(exportsMap)
  .filter((k) => !k.includes('*'))
  .map((k) => (k === '.' ? '.' : k.replace(/^\.\//, '')));

const fromConsumers = existsSync(join(root, 'scripts/consumer-subpaths.txt'))
  ? readFileSync(join(root, 'scripts/consumer-subpaths.txt'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  : [];

const subpaths = [...new Set([...fromExports, ...fromConsumers])].sort();

/**
 * Resolve a subpath the way Node does: an explicit exports entry wins and names its own target
 * (`./key-sync/node` deliberately points at `key-sync-node.js`, which no path convention would
 * guess). Only a subpath with no explicit entry falls through to the `./*` wildcard, where the
 * convention does apply.
 */
function targetsFor(sub) {
  const key = sub === '.' ? '.' : `./${sub}`;
  const entry = exportsMap[key];
  // A string target is a direct file (e.g. "./package.json"), not a conditions object.
  if (typeof entry === 'string') return [entry.replace(/^\.\//, '')];
  if (entry && typeof entry === 'object') {
    return [entry.import, entry.types].filter(Boolean).map((t) => t.replace(/^\.\//, ''));
  }
  const base = sub === '.' ? 'index' : sub;
  return [`lib/esm/${base}.js`, `lib/esm/${base}.d.ts`];
}

const missing = [];
for (const sub of subpaths) {
  const gaps = targetsFor(sub).filter((t) => !existsSync(join(root, t)));
  if (gaps.length) missing.push(`${sub} — missing ${gaps.join(' and ')}`);
}

if (missing.length) {
  console.error(`check-subpaths: ${missing.length} of ${subpaths.length} subpaths have no compiled output\n`);
  for (const m of missing) console.error(`  ${m}`);
  console.error('\nThe tsconfig must compile the whole src folder, not the entry graph.');
  process.exit(1);
}

console.log(`check-subpaths: all ${subpaths.length} subpaths resolve against lib/esm.`);
