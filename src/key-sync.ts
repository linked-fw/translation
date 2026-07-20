import ts from 'typescript';

export interface ExtractedTranslationKey {
  key: string;
  sourceText: string;
  file: string;
  line: number;
}

export interface TranslationKeySyncTarget {
  list(data: { appId: string }): Promise<Array<{ key: string; sourceText?: string }>>;
  upsert(data: {
    appId: string;
    key: string;
    sourceText: string;
    kind: 'ui';
  }): Promise<unknown>;
}

export interface TranslationKeySyncReport {
  created: string[];
  updated: string[];
  unchanged: string[];
  orphaned: string[];
  conflicts: Array<{ key: string; defaults: string[] }>;
}

function literalText(node: ts.Node | undefined): string | undefined {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
}

/** Extract static `t(key, default)` and `<T keyName defaultValue>` call sites. */
export function extractTranslationKeys(
  source: string,
  file = 'source.tsx',
): ExtractedTranslationKey[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const extracted: ExtractedTranslationKey[] = [];
  const add = (keyNode: ts.Node | undefined, defaultNode: ts.Node | undefined) => {
    const key = literalText(keyNode);
    const sourceText = literalText(defaultNode);
    if (!key || sourceText === undefined) return;
    const { line } = sourceFile.getLineAndCharacterOfPosition(keyNode!.getStart(sourceFile));
    extracted.push({ key, sourceText, file, line: line + 1 });
  };
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 't'
    ) {
      add(node.arguments[0], node.arguments[1]);
    } else if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      if (node.tagName.getText(sourceFile) === 'T') {
        const attrs = new Map(
          node.attributes.properties
            .filter(ts.isJsxAttribute)
            .map((attr) => [attr.name.getText(sourceFile), attr.initializer]),
        );
        const fromAttribute = (initializer: ts.JsxAttributeValue | undefined) => {
          if (!initializer) return undefined;
          if (ts.isStringLiteral(initializer)) return initializer;
          return ts.isJsxExpression(initializer) ? initializer.expression : undefined;
        };
        add(fromAttribute(attrs.get('keyName')), fromAttribute(attrs.get('defaultValue')));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return extracted;
}

/**
 * Apply extracted keys. Source drift is delegated to the provider, which marks
 * existing units stale. Orphans are deliberately report-only.
 */
export async function syncTranslationKeys(
  target: TranslationKeySyncTarget,
  appId: string,
  extracted: ExtractedTranslationKey[],
): Promise<TranslationKeySyncReport> {
  const existing = await target.list({ appId });
  const existingByKey = new Map(existing.map((item) => [item.key, item]));
  const defaultsByKey = new Map<string, Set<string>>();
  for (const item of extracted) {
    const defaults = defaultsByKey.get(item.key) ?? new Set<string>();
    defaults.add(item.sourceText);
    defaultsByKey.set(item.key, defaults);
  }
  const report: TranslationKeySyncReport = {
    created: [], updated: [], unchanged: [], orphaned: [], conflicts: [],
  };
  for (const [key, defaults] of defaultsByKey) {
    if (defaults.size > 1) {
      report.conflicts.push({ key, defaults: [...defaults].sort() });
      continue;
    }
    const sourceText = [...defaults][0];
    const current = existingByKey.get(key);
    if (!current) report.created.push(key);
    else if (current.sourceText !== sourceText) report.updated.push(key);
    else {
      report.unchanged.push(key);
      continue;
    }
    await target.upsert({ appId, key, sourceText, kind: 'ui' });
  }
  report.orphaned = existing
    .map((item) => item.key)
    .filter((key) => !defaultsByKey.has(key))
    .sort();
  return report;
}
