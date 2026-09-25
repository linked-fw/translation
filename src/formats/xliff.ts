import {
  normalizeParsedTranslationExchangeDocument,
  type ParsedTranslationExchangeDocument,
  type ParsedTranslationExchangeEntry,
  type TranslationExchangeDocument,
  type TranslationExchangeEntry,
  type TranslationExchangeValue,
  type TranslationFormatAdapter,
} from '../exchange.js';
import type { TranslationState } from '../records.js';

const UTF8 = new TextEncoder();
/**
 * Our own metadata namespace, a sibling of the translation vocabulary
 * (`https://id.linked.cm/translation/vocab#`). Files exported before 0.3.0
 * used a Create Now URI and a `cn:` prefix; the reader below still accepts
 * both, so those files keep importing.
 */
const EXCHANGE_NAMESPACE = 'https://id.linked.cm/translation/exchange/1';
const PREFIX = 'lt';
const LEGACY_PREFIX = 'cn';
/** `from`/`category` on a `<note>`, in current and pre-0.3.0 spelling. */
const NOTE_ROLES = {
  description: ['linked-description', 'create-now-description'],
  target: ['linked-target', 'create-now-target'],
} as const;

function isNoteRole(
  value: string | undefined,
  role: keyof typeof NOTE_ROLES,
): boolean {
  return value !== undefined && (NOTE_ROLES[role] as readonly string[]).includes(value);
}
const XLIFF_12_NAMESPACE = 'urn:oasis:names:tc:xliff:document:1.2';
const XLIFF_20_NAMESPACE = 'urn:oasis:names:tc:xliff:document:2.0';
const XML_MEDIA_TYPE = 'application/xliff+xml';

const INLINE_12 = new Set([
  'bpt',
  'bx',
  'ept',
  'ex',
  'g',
  'it',
  'mrk',
  'ph',
  'sub',
  'x',
]);
const INLINE_20 = new Set(['ec', 'em', 'mrk', 'pc', 'ph', 'sc', 'sm']);

type XmlChild = XmlNode | string;

interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlChild[];
}

export interface XliffFinding {
  code: 'unsupported-inline';
  message: string;
  element: string;
  unitId?: string;
}

export interface XliffParseOptions {
  onFinding?: (finding: XliffFinding) => void;
}

interface MutableParsedEntry extends ParsedTranslationExchangeEntry {
  translations: Record<string, TranslationExchangeValue>;
}

function text(input: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(input);
}

function localName(name: string): string {
  const separator = name.indexOf(':');
  return separator === -1 ? name : name.slice(separator + 1);
}

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value)
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function decodeEntities(value: string): string {
  const decoded = value.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g,
    (entity, body: string) => {
      if (body === 'amp') return '&';
      if (body === 'lt') return '<';
      if (body === 'gt') return '>';
      if (body === 'quot') return '"';
      if (body === 'apos') return "'";
      const point = Number.parseInt(body.slice(body[1] === 'x' ? 2 : 1), body[1] === 'x' ? 16 : 10);
      if (!Number.isFinite(point) || point > 0x10ffff) {
        throw new Error(`Invalid XML character reference "&${body};".`);
      }
      return String.fromCodePoint(point);
    },
  );
  const unresolved = /&([A-Za-z_:][\w.:-]*);/.exec(decoded);
  if (unresolved) {
    throw new Error(`Unsupported XML entity reference "&${unresolved[1]};".`);
  }
  return decoded;
}

function readTagEnd(xml: string, start: number): number {
  let quote = '';
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  throw new Error('Malformed XML: unterminated tag.');
}

function parseAttributes(input: string): {
  name: string;
  attributes: Record<string, string>;
  selfClosing: boolean;
} {
  let content = input.trim();
  const selfClosing = content.endsWith('/');
  if (selfClosing) content = content.slice(0, -1).trimEnd();
  const nameMatch = /^([^\s/>]+)/.exec(content);
  if (!nameMatch) throw new Error('Malformed XML: element name is missing.');
  const name = nameMatch[1];
  const attributes: Record<string, string> = {};
  let remainder = content.slice(name.length);
  const attributePattern = /^\s+([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/;
  while (remainder.trim()) {
    const match = attributePattern.exec(remainder);
    if (!match) {
      throw new Error(`Malformed XML attributes on <${name}>.`);
    }
    if (attributes[match[1]] !== undefined) {
      throw new Error(`Duplicate XML attribute "${match[1]}".`);
    }
    attributes[match[1]] = decodeEntities(match[3] ?? match[4] ?? '');
    remainder = remainder.slice(match[0].length);
  }
  return { name, attributes, selfClosing };
}

/**
 * Small, non-validating XML parser for the deliberately narrow XLIFF surface.
 * DTDs and entity declarations are rejected before tokenization, so parsing
 * never performs filesystem or network resolution.
 */
function parseXml(xml: string): XmlNode {
  if (/<!DOCTYPE\b/i.test(xml) || /<!ENTITY\b/i.test(xml)) {
    throw new Error('XLIFF containing a DTD or entity declaration is not allowed.');
  }
  const root: XmlNode = {
    name: '#document',
    attributes: {},
    children: [],
  };
  const stack = [root];
  let cursor = 0;
  while (cursor < xml.length) {
    const opening = xml.indexOf('<', cursor);
    if (opening === -1) {
      const trailing = xml.slice(cursor);
      if (trailing) stack.at(-1)!.children.push(decodeEntities(trailing));
      break;
    }
    if (opening > cursor) {
      stack.at(-1)!.children.push(decodeEntities(xml.slice(cursor, opening)));
    }
    if (xml.startsWith('<!--', opening)) {
      const closing = xml.indexOf('-->', opening + 4);
      if (closing === -1) throw new Error('Malformed XML comment.');
      cursor = closing + 3;
      continue;
    }
    if (xml.startsWith('<?', opening)) {
      const closing = xml.indexOf('?>', opening + 2);
      if (closing === -1) throw new Error('Malformed XML processing instruction.');
      cursor = closing + 2;
      continue;
    }
    if (xml.startsWith('<![CDATA[', opening)) {
      const closing = xml.indexOf(']]>', opening + 9);
      if (closing === -1) throw new Error('Malformed XML CDATA section.');
      stack.at(-1)!.children.push(xml.slice(opening + 9, closing));
      cursor = closing + 3;
      continue;
    }
    if (xml.startsWith('</', opening)) {
      const closing = readTagEnd(xml, opening + 2);
      const name = xml.slice(opening + 2, closing).trim();
      const current = stack.pop();
      if (!current || current === root || current.name !== name) {
        throw new Error(`Malformed XML closing tag </${name}>.`);
      }
      cursor = closing + 1;
      continue;
    }
    if (xml.startsWith('<!', opening)) {
      throw new Error('Unsupported XML declaration.');
    }
    const closing = readTagEnd(xml, opening + 1);
    const parsed = parseAttributes(xml.slice(opening + 1, closing));
    const node: XmlNode = {
      name: parsed.name,
      attributes: parsed.attributes,
      children: [],
    };
    stack.at(-1)!.children.push(node);
    if (!parsed.selfClosing) stack.push(node);
    cursor = closing + 1;
  }
  if (stack.length !== 1) {
    throw new Error(`Malformed XML: unclosed <${stack.at(-1)!.name}> element.`);
  }
  const documentElements = root.children.filter(
    (child): child is XmlNode => typeof child !== 'string',
  );
  if (documentElements.length !== 1) {
    throw new Error('XLIFF must contain exactly one document element.');
  }
  return documentElements[0];
}

function children(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter(
    (child): child is XmlNode =>
      typeof child !== 'string' && localName(child.name) === name,
  );
}

function descendants(node: XmlNode, name: string): XmlNode[] {
  const found: XmlNode[] = [];
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if (localName(child.name) === name) found.push(child);
    found.push(...descendants(child, name));
  }
  return found;
}

function first(node: XmlNode, name: string): XmlNode | undefined {
  return children(node, name)[0];
}

function attribute(node: XmlNode, name: string): string | undefined {
  const direct = node.attributes[name];
  if (direct !== undefined) return direct;
  const entry = Object.entries(node.attributes).find(
    ([qualified]) => localName(qualified) === name,
  );
  return entry?.[1];
}

function serializeNode(node: XmlNode): string {
  const attributes = Object.entries(node.attributes)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
  if (node.children.length === 0) return `<${node.name}${attributes}/>`;
  return `<${node.name}${attributes}>${node.children
    .map((child) =>
      typeof child === 'string' ? escapeText(child) : serializeNode(child),
    )
    .join('')}</${node.name}>`;
}

function innerXml(
  node: XmlNode | undefined,
  supportedInline: Set<string>,
  options: XliffParseOptions,
  unitId?: string,
): string | undefined {
  if (!node) return undefined;
  const visit = (parent: XmlNode): void => {
    for (const child of parent.children) {
      if (typeof child === 'string') continue;
      const name = localName(child.name);
      if (!supportedInline.has(name)) {
        options.onFinding?.({
          code: 'unsupported-inline',
          message: `Unsupported inline XLIFF element <${child.name}> was preserved.`,
          element: child.name,
          unitId,
        });
      }
      visit(child);
    }
  };
  visit(node);
  return node.children
    .map((child) =>
      typeof child === 'string' ? child : serializeNode(child),
    )
    .join('');
}

function plainText(node: XmlNode | undefined): string | undefined {
  if (!node) return undefined;
  return node.children
    .map((child) => (typeof child === 'string' ? child : plainText(child) ?? ''))
    .join('');
}

function metadata(node: XmlNode, name: string): string | undefined {
  return (
    node.attributes[`${PREFIX}:${name}`] ??
    node.attributes[`${LEGACY_PREFIX}:${name}`] ??
    attribute(node, name)
  );
}

function recognizedState(value: string | undefined): TranslationState | undefined {
  if (
    value === 'untranslated' ||
    value === 'machine' ||
    value === 'reviewed' ||
    value === 'stale'
  ) {
    return value;
  }
  if (value === 'final' || value === 'reviewed' || value === 'signed-off') {
    return 'reviewed';
  }
  if (value === 'translated') return 'machine';
  if (value === 'needs-review-translation') return 'stale';
  if (value === 'new' || value === 'initial') return 'untranslated';
  return undefined;
}

function commonDocument(root: XmlNode): Omit<
  ParsedTranslationExchangeDocument,
  'sourceLanguage' | 'targetLanguages' | 'entries'
> {
  return {
    schemaVersion: 1,
    ...(metadata(root, 'app-id') ? { appId: metadata(root, 'app-id') } : {}),
    ...(metadata(root, 'branch-id')
      ? { branchId: metadata(root, 'branch-id') }
      : {}),
    ...(metadata(root, 'exported-at')
      ? { exportedAt: metadata(root, 'exported-at') }
      : {}),
    ...(metadata(root, 'revision-watermark')
      ? { revisionWatermark: metadata(root, 'revision-watermark') }
      : {}),
    ...(metadata(root, 'contract-set-hash')
      ? { contractSetHash: metadata(root, 'contract-set-hash') }
      : {}),
  };
}

function mergeUnit(
  entries: Map<string, MutableParsedEntry>,
  unit: XmlNode,
  sourceText: string | undefined,
  targetText: string | undefined,
  targetLanguage: string | undefined,
  targetState: TranslationState | undefined,
  targetNote: string | undefined,
  description: string | undefined,
): void {
  const key = metadata(unit, 'key') ?? attribute(unit, 'resname') ?? attribute(unit, 'name') ?? attribute(unit, 'id');
  if (!key) throw new Error('XLIFF unit is missing an id/key.');
  const namespace = metadata(unit, 'namespace');
  const identity = `${namespace ?? ''}\u0000${key}`;
  let entry = entries.get(identity);
  if (!entry) {
    entry = {
      key,
      ...(namespace ? { namespace } : {}),
      kind: metadata(unit, 'kind') === 'semantic' ? 'semantic' : 'ui',
      format: metadata(unit, 'format') === 'icu' ? 'icu' : 'simple',
      ...(sourceText !== undefined ? { sourceText } : {}),
      ...(metadata(unit, 'key-version-id')
        ? { keyVersionId: metadata(unit, 'key-version-id') }
        : {}),
      ...(metadata(unit, 'source-hash')
        ? { sourceHash: metadata(unit, 'source-hash') }
        : {}),
      ...(metadata(unit, 'contract-hash')
        ? { contractHash: metadata(unit, 'contract-hash') }
        : {}),
      ...(metadata(unit, 'argument-signature')
        ? { argumentSignature: metadata(unit, 'argument-signature') }
        : {}),
      ...(description ? { description } : {}),
      translations: {},
    };
    entries.set(identity, entry);
  } else if (sourceText !== undefined && entry.sourceText !== sourceText) {
    throw new Error(`XLIFF source text conflicts for key "${key}".`);
  }
  if (targetLanguage && targetText !== undefined) {
    if (entry.translations[targetLanguage]) {
      throw new Error(
        `Duplicate XLIFF target for key "${key}" in ${targetLanguage}.`,
      );
    }
    entry.translations[targetLanguage] = {
      text: targetText,
      ...(targetState ? { state: targetState } : {}),
      ...(targetNote ? { note: targetNote } : {}),
    };
  }
}

function parse12(
  root: XmlNode,
  options: XliffParseOptions,
): ParsedTranslationExchangeDocument {
  const entries = new Map<string, MutableParsedEntry>();
  let sourceLanguage = attribute(root, 'source-language');
  const targetLanguages = new Set<string>();
  for (const file of descendants(root, 'file')) {
    sourceLanguage ??= attribute(file, 'source-language');
    const targetLanguage = attribute(file, 'target-language');
    if (targetLanguage) targetLanguages.add(targetLanguage);
    for (const unit of descendants(file, 'trans-unit')) {
      const id = attribute(unit, 'id');
      const sourceText = innerXml(first(unit, 'source'), INLINE_12, options, id);
      const target = first(unit, 'target');
      const language =
        attribute(target ?? unit, 'lang') ?? targetLanguage;
      if (language) targetLanguages.add(language);
      const notes = children(unit, 'note');
      const description = plainText(
        notes.find((note) => isNoteRole(attribute(note, 'from'), 'description')),
      );
      const targetNote = plainText(
        notes.find(
          (note) =>
            isNoteRole(attribute(note, 'from'), 'target') &&
            (!language || !attribute(note, 'lang') || attribute(note, 'lang') === language),
        ),
      );
      mergeUnit(
        entries,
        unit,
        sourceText,
        innerXml(target, INLINE_12, options, id),
        language,
        recognizedState(metadata(target ?? unit, 'state') ?? attribute(target ?? unit, 'state')),
        targetNote,
        description ?? plainText(notes[0]),
      );
    }
  }
  if (!sourceLanguage) throw new Error('XLIFF 1.2 source language is missing.');
  return normalizeParsedTranslationExchangeDocument({
    ...commonDocument(root),
    sourceLanguage,
    targetLanguages: [...targetLanguages],
    entries: [...entries.values()],
  });
}

function parse20(
  root: XmlNode,
  options: XliffParseOptions,
): ParsedTranslationExchangeDocument {
  const entries = new Map<string, MutableParsedEntry>();
  const sourceLanguage = attribute(root, 'srcLang');
  if (!sourceLanguage) throw new Error('XLIFF 2.0 srcLang is missing.');
  const targetLanguages = new Set<string>();
  const rootTargetLanguage = attribute(root, 'trgLang');
  if (rootTargetLanguage) targetLanguages.add(rootTargetLanguage);
  for (const file of descendants(root, 'file')) {
    const fileTargetLanguage =
      attribute(file, 'trgLang') ??
      metadata(file, 'target-language') ??
      rootTargetLanguage;
    if (fileTargetLanguage) targetLanguages.add(fileTargetLanguage);
    for (const unit of descendants(file, 'unit')) {
      const segment = first(unit, 'segment') ?? descendants(unit, 'segment')[0];
      if (!segment) continue;
      const target = first(segment, 'target');
      const language = attribute(target ?? unit, 'lang') ?? fileTargetLanguage;
      if (language) targetLanguages.add(language);
      const notesContainer = first(unit, 'notes');
      const notes = notesContainer ? children(notesContainer, 'note') : [];
      const description = plainText(
        notes.find(
          (note) => isNoteRole(attribute(note, 'category'), 'description'),
        ),
      );
      const targetNote = plainText(
        notes.find(
          (note) =>
            isNoteRole(attribute(note, 'category'), 'target') &&
            (!language || !attribute(note, 'lang') || attribute(note, 'lang') === language),
        ),
      );
      const id = attribute(unit, 'id');
      mergeUnit(
        entries,
        unit,
        innerXml(first(segment, 'source'), INLINE_20, options, id),
        innerXml(target, INLINE_20, options, id),
        language,
        recognizedState(metadata(segment, 'state') ?? attribute(segment, 'state')),
        targetNote,
        description ?? plainText(notes[0]),
      );
    }
  }
  return normalizeParsedTranslationExchangeDocument({
    ...commonDocument(root),
    sourceLanguage,
    targetLanguages: [...targetLanguages],
    entries: [...entries.values()],
  });
}

function parseXliff(
  input: Uint8Array,
  expectedVersion: '1.2' | '2.0',
  options: XliffParseOptions = {},
): ParsedTranslationExchangeDocument {
  const root = parseXml(text(input));
  if (localName(root.name) !== 'xliff') {
    throw new Error('Document is not XLIFF.');
  }
  const version = attribute(root, 'version');
  if (version !== expectedVersion) {
    throw new Error(
      `Expected XLIFF ${expectedVersion}, received ${version ?? 'an unknown version'}.`,
    );
  }
  return version === '1.2' ? parse12(root, options) : parse20(root, options);
}

function deterministicId(entry: TranslationExchangeEntry, index: number): string {
  const identity = `${entry.namespace ?? 'default'}:${entry.key}`;
  return `u${index + 1}-${encodeURIComponent(identity).replaceAll('%', '_')}`;
}

function state12(state: TranslationState | undefined): string {
  if (state === 'reviewed') return 'final';
  if (state === 'stale') return 'needs-review-translation';
  if (state === 'machine') return 'translated';
  return 'new';
}

function state20(state: TranslationState | undefined): string {
  if (state === 'reviewed') return 'final';
  if (state === 'stale') return 'translated';
  if (state === 'machine') return 'translated';
  return 'initial';
}

function metadataAttributes(entry: TranslationExchangeEntry): string {
  return [
    [`${PREFIX}:key`, entry.key],
    [`${PREFIX}:namespace`, entry.namespace],
    [`${PREFIX}:kind`, entry.kind],
    [`${PREFIX}:format`, entry.format],
    [`${PREFIX}:key-version-id`, entry.keyVersionId],
    [`${PREFIX}:source-hash`, entry.sourceHash],
    [`${PREFIX}:contract-hash`, entry.contractHash],
    [`${PREFIX}:argument-signature`, entry.argumentSignature],
  ]
    .filter((pair): pair is [string, string] => pair[1] !== undefined)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
}

function rootMetadata(document: TranslationExchangeDocument): string {
  return [
    [`${PREFIX}:schema-version`, String(document.schemaVersion)],
    [`${PREFIX}:app-id`, document.appId],
    [`${PREFIX}:branch-id`, document.branchId],
    [`${PREFIX}:exported-at`, document.exportedAt],
    [`${PREFIX}:revision-watermark`, document.revisionWatermark],
    [`${PREFIX}:contract-set-hash`, document.contractSetHash],
  ]
    .filter((pair): pair is [string, string] => pair[1] !== undefined)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
}

function validatedMixedContent(value: string, inline: Set<string>): string {
  if (!value.includes('<')) return escapeText(value);
  try {
    const wrapper = parseXml(`<cn-wrapper>${value}</cn-wrapper>`);
    const nodes = wrapper.children.filter(
      (child): child is XmlNode => typeof child !== 'string',
    );
    if (
      nodes.length === 0 ||
      nodes.some((node) => !inline.has(localName(node.name)))
    ) {
      return escapeText(value);
    }
    return wrapper.children
      .map((child) =>
        typeof child === 'string' ? escapeText(child) : serializeNode(child),
      )
      .join('');
  } catch {
    return escapeText(value);
  }
}

function targets(document: TranslationExchangeDocument): Array<string | undefined> {
  return document.targetLanguages.length > 0
    ? document.targetLanguages
    : [undefined];
}

function serialize12(document: TranslationExchangeDocument): string {
  const files = targets(document)
    .map((language, fileIndex) => {
      const units = document.entries
        .map((entry, index) => {
          const target = language ? entry.translations[language] : undefined;
          const id = deterministicId(entry, index);
          const notes = [
            entry.description
              ? `<note from="${NOTE_ROLES.description[0]}">${escapeText(entry.description)}</note>`
              : '',
            target?.note
              ? `<note from="${NOTE_ROLES.target[0]}" xml:lang="${escapeAttribute(language!)}">${escapeText(target.note)}</note>`
              : '',
          ].join('');
          return `<trans-unit id="${escapeAttribute(id)}" resname="${escapeAttribute(entry.key)}"${metadataAttributes(entry)}><source>${validatedMixedContent(entry.sourceText, INLINE_12)}</source>${
            language && target
              ? `<target xml:lang="${escapeAttribute(language)}" state="${state12(target?.state)}" ${PREFIX}:state="${escapeAttribute(target?.state ?? 'untranslated')}">${validatedMixedContent(target?.text ?? '', INLINE_12)}</target>`
              : ''
          }${notes}</trans-unit>`;
        })
        .join('');
      return `<file id="f${fileIndex + 1}" original="linked" datatype="plaintext" source-language="${escapeAttribute(document.sourceLanguage)}"${
        language ? ` target-language="${escapeAttribute(language)}"` : ''
      }><body>${units}</body></file>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<xliff xmlns="${XLIFF_12_NAMESPACE}" xmlns:${PREFIX}="${EXCHANGE_NAMESPACE}" version="1.2"${rootMetadata(document)}>${files}</xliff>\n`;
}

function serialize20(document: TranslationExchangeDocument): string {
  const files = targets(document)
    .map((language, fileIndex) => {
      const units = document.entries
        .map((entry, index) => {
          const target = language ? entry.translations[language] : undefined;
          const id = deterministicId(entry, index);
          const notes =
            entry.description || target?.note
              ? `<notes>${
                  entry.description
                    ? `<note category="${NOTE_ROLES.description[0]}">${escapeText(entry.description)}</note>`
                    : ''
                }${
                  target?.note
                    ? `<note category="${NOTE_ROLES.target[0]}" xml:lang="${escapeAttribute(language!)}">${escapeText(target.note)}</note>`
                    : ''
                }</notes>`
              : '';
          return `<unit id="${escapeAttribute(id)}" name="${escapeAttribute(entry.key)}"${metadataAttributes(entry)}>${notes}<segment id="s1" state="${state20(target?.state)}" ${PREFIX}:state="${escapeAttribute(target?.state ?? 'untranslated')}"><source>${validatedMixedContent(entry.sourceText, INLINE_20)}</source>${
            language && target
              ? `<target xml:lang="${escapeAttribute(language)}">${validatedMixedContent(target?.text ?? '', INLINE_20)}</target>`
              : ''
          }</segment></unit>`;
        })
        .join('');
      return `<file id="f${fileIndex + 1}"${
        language ? ` ${PREFIX}:target-language="${escapeAttribute(language)}"` : ''
      }>${units}</file>`;
    })
    .join('');
  const singleTarget =
    document.targetLanguages.length === 1
      ? ` trgLang="${escapeAttribute(document.targetLanguages[0])}"`
      : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<xliff xmlns="${XLIFF_20_NAMESPACE}" xmlns:${PREFIX}="${EXCHANGE_NAMESPACE}" version="2.0" srcLang="${escapeAttribute(document.sourceLanguage)}"${singleTarget}${rootMetadata(document)}>${files}</xliff>\n`;
}

function sniffVersion(
  input: Uint8Array,
  expectedVersion: '1.2' | '2.0',
  fileName?: string,
): boolean {
  if (fileName && !/\.xlf(f)?$/i.test(fileName)) return false;
  const prefix = text(input.slice(0, Math.min(input.length, 4096)));
  return (
    /<(?:(?:[\w.-]+):)?xliff\b/i.test(prefix) &&
    new RegExp(`\\bversion\\s*=\\s*["']${expectedVersion.replace('.', '\\.')}["']`).test(prefix)
  );
}

export const xliff12Adapter: TranslationFormatAdapter = {
  format: 'xliff-1.2',
  sniff: (input, fileName) => sniffVersion(input, '1.2', fileName),
  parse: async (input, options) =>
    parseXliff(input, '1.2', (options ?? {}) as XliffParseOptions),
  serialize: async (document) => ({
    fileName: 'translations.xlf',
    mediaType: XML_MEDIA_TYPE,
    body: UTF8.encode(serialize12(document)),
  }),
};

export const xliff20Adapter: TranslationFormatAdapter = {
  format: 'xliff-2.0',
  sniff: (input, fileName) => sniffVersion(input, '2.0', fileName),
  parse: async (input, options) =>
    parseXliff(input, '2.0', (options ?? {}) as XliffParseOptions),
  serialize: async (document) => ({
    fileName: 'translations.xlf',
    mediaType: XML_MEDIA_TYPE,
    body: UTF8.encode(serialize20(document)),
  }),
};
