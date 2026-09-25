import {
  normalizeParsedTranslationExchangeDocument,
  validateTranslationExchangeDocument,
  type ParsedTranslationExchangeDocument,
  type ParsedTranslationExchangeEntry,
  type SerializedTranslationDocument,
  type TranslationExchangeDocument,
  type TranslationExchangeValue,
  type TranslationFormatAdapter,
} from '../exchange.js';

const ESCAPING_VERSION = 'apostrophe-v1';

/**
 * One row represents one key/language pair. Document and key-version metadata
 * are repeated deliberately so a CSV remains useful after spreadsheet tools
 * reorder or filter its rows.
 */
export const TRANSLATION_CSV_COLUMNS = [
  'schemaVersion',
  'appId',
  'branchId',
  'sourceLanguage',
  'targetLanguage',
  'key',
  'namespace',
  'kind',
  'sourceText',
  'targetText',
  'state',
  'note',
  'description',
  'format',
  'keyVersionId',
  'sourceHash',
  'contractHash',
  'argumentSignature',
  'exportedAt',
  'revisionWatermark',
  'contractSetHash',
  'escaping',
] as const;

/** Pre-0.3.0 spelling of a column, accepted on import. */
const LEGACY_CSV_COLUMNS: Readonly<Record<string, CsvColumn>> = {
  createNowEscaping: 'escaping',
};

type CsvColumn = (typeof TRANSLATION_CSV_COLUMNS)[number];
type CsvRecord = Partial<Record<CsvColumn, string>>;

const REQUIRED_COLUMNS = [
  'sourceLanguage',
  'targetLanguage',
  'key',
  'targetText',
] as const;

const DOCUMENT_COLUMNS = [
  'appId',
  'branchId',
  'sourceLanguage',
  'exportedAt',
  'revisionWatermark',
  'contractSetHash',
] as const;

const ENTRY_COLUMNS = [
  'kind',
  'sourceText',
  'description',
  'format',
  'keyVersionId',
  'sourceHash',
  'contractHash',
  'argumentSignature',
] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isSpreadsheetDangerous(value: string): boolean {
  return /^[=+\-@\t\r]/u.test(value);
}

function protectSpreadsheetCell(value: string): string {
  return isSpreadsheetDangerous(value) ? `'${value}` : value;
}

function restoreSpreadsheetCell(
  value: string,
  escaping: string | undefined,
  column: string,
): string {
  const [version, columns = ''] = escaping?.split(':', 2) ?? [];
  if (
    version === ESCAPING_VERSION &&
    columns.split('|').includes(column) &&
    value.startsWith("'") &&
    isSpreadsheetDangerous(value.slice(1))
  ) {
    return value.slice(1);
  }
  return value;
}

function encodeCsvCell(value: string): string {
  const protectedValue = protectSpreadsheetCell(value);
  return /[",\r\n]/u.test(protectedValue)
    ? `"${protectedValue.replace(/"/gu, '""')}"`
    : protectedValue;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new Error('Malformed CSV: quote must begin an empty field.');
      }
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (character === '\r' && text[index + 1] === '\n') index += 1;
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('Malformed CSV: unterminated quoted field.');
  if (row.length > 0 || field.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function decodeUtf8(input: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true })
      .decode(input)
      .replace(/^\uFEFF/u, '');
  } catch {
    throw new Error('Translation CSV must be valid UTF-8.');
  }
}

function optional(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

function entryKind(value: string | undefined): 'ui' | 'semantic' {
  if (value === undefined || value === '' || value === 'ui') return 'ui';
  if (value === 'semantic') return 'semantic';
  throw new Error(`Translation CSV kind "${value}" is invalid.`);
}

function entryFormat(value: string | undefined): 'simple' | 'icu' {
  if (value === undefined || value === '' || value === 'simple') return 'simple';
  if (value === 'icu') return 'icu';
  throw new Error(`Translation CSV format "${value}" is invalid.`);
}

function rowsToRecords(rows: string[][]): CsvRecord[] {
  if (rows.length === 0) throw new Error('Translation CSV is empty.');
  const header = rows[0]!;
  const canonicalHeader = header.map(
    (column) => LEGACY_CSV_COLUMNS[column] ?? column,
  );
  const knownColumns = new Set<string>(TRANSLATION_CSV_COLUMNS);
  const seen = new Set<string>();
  for (const column of canonicalHeader) {
    if (seen.has(column)) {
      throw new Error(`Translation CSV has duplicate column "${column}".`);
    }
    seen.add(column);
  }
  for (const required of REQUIRED_COLUMNS) {
    if (!seen.has(required)) {
      throw new Error(`Translation CSV is missing required column "${required}".`);
    }
  }

  const records: CsvRecord[] = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const values = rows[rowIndex]!;
    if (values.every((value) => value === '')) continue;
    if (values.length > header.length) {
      throw new Error(
        `Translation CSV row ${rowIndex + 1} has more values than its header.`,
      );
    }
    const raw: Record<string, string> = {};
    canonicalHeader.forEach((column, index) => {
      if (knownColumns.has(column)) raw[column] = values[index] ?? '';
    });
    const escaping = raw.escaping;
    const record: CsvRecord = {};
    for (const column of TRANSLATION_CSV_COLUMNS) {
      if (raw[column] !== undefined) {
        record[column] = restoreSpreadsheetCell(raw[column]!, escaping, column);
      }
    }
    records.push(record);
  }
  if (records.length === 0) {
    throw new Error('Translation CSV does not contain any translation rows.');
  }
  return records;
}

function assertConsistent(
  label: string,
  column: string,
  expected: string | undefined,
  actual: string | undefined,
): void {
  if (expected !== actual) {
    throw new Error(
      `Translation CSV conflict for ${label}: column "${column}" is inconsistent.`,
    );
  }
}

function parseDocument(records: CsvRecord[]): ParsedTranslationExchangeDocument {
  const first = records[0]!;
  if (optional(first.schemaVersion) !== undefined && first.schemaVersion !== '1') {
    throw new Error('Translation CSV schemaVersion must be 1.');
  }
  const sourceLanguage = optional(first.sourceLanguage);
  if (!sourceLanguage) {
    throw new Error('Translation CSV sourceLanguage is required.');
  }

  for (const record of records.slice(1)) {
    if (
      optional(record.schemaVersion) !== undefined &&
      record.schemaVersion !== '1'
    ) {
      throw new Error('Translation CSV schemaVersion must be 1.');
    }
    for (const column of DOCUMENT_COLUMNS) {
      assertConsistent(
        'document metadata',
        column,
        optional(first[column]),
        optional(record[column]),
      );
    }
  }

  const targetLanguages = [...new Set(
    records.map((record) => {
      const language = optional(record.targetLanguage);
      if (!language) throw new Error('Translation CSV targetLanguage is required.');
      return language;
    }),
  )].sort(compareText);

  type EntryAccumulator = {
    entry: ParsedTranslationExchangeEntry;
    evidence: CsvRecord;
  };
  const grouped = new Map<string, EntryAccumulator>();

  records.forEach((record, index) => {
    const key = optional(record.key);
    if (!key) throw new Error(`Translation CSV row ${index + 2} key is required.`);
    const targetLanguage = optional(record.targetLanguage)!;
    const namespace = optional(record.namespace);
    const identity = `${namespace ?? ''}\u0000${key}`;
    const existing = grouped.get(identity);

    if (existing) {
      for (const column of ENTRY_COLUMNS) {
        assertConsistent(
          `key "${key}"`,
          column,
          optional(existing.evidence[column]),
          optional(record[column]),
        );
      }
      if (existing.entry.translations[targetLanguage]) {
        throw new Error(
          `Duplicate translation entry for "${key}" in ${targetLanguage}.`,
        );
      }
      existing.entry.translations[targetLanguage] = translationValue(record);
      return;
    }

    const entry: ParsedTranslationExchangeEntry = {
      key,
      ...(namespace ? { namespace } : {}),
      kind: entryKind(record.kind),
      format: entryFormat(record.format),
      ...(record.sourceText === undefined
        ? {}
        : { sourceText: record.sourceText }),
      ...(optional(record.keyVersionId)
        ? { keyVersionId: record.keyVersionId }
        : {}),
      ...(optional(record.sourceHash) ? { sourceHash: record.sourceHash } : {}),
      ...(optional(record.contractHash)
        ? { contractHash: record.contractHash }
        : {}),
      ...(optional(record.argumentSignature)
        ? { argumentSignature: record.argumentSignature }
        : {}),
      ...(optional(record.description)
        ? { description: record.description }
        : {}),
      translations: {
        [targetLanguage]: translationValue(record),
      },
    };
    grouped.set(identity, { entry, evidence: record });
  });

  return normalizeParsedTranslationExchangeDocument({
    schemaVersion: 1,
    ...(optional(first.appId) ? { appId: first.appId } : {}),
    ...(optional(first.branchId) ? { branchId: first.branchId } : {}),
    sourceLanguage,
    targetLanguages,
    ...(optional(first.exportedAt) ? { exportedAt: first.exportedAt } : {}),
    ...(optional(first.revisionWatermark)
      ? { revisionWatermark: first.revisionWatermark }
      : {}),
    ...(optional(first.contractSetHash)
      ? { contractSetHash: first.contractSetHash }
      : {}),
    entries: [...grouped.values()]
      .map(({ entry }) => entry)
      .sort((left, right) =>
        compareText(left.namespace ?? '', right.namespace ?? '') ||
        compareText(left.key, right.key),
      ),
  });
}

function translationValue(record: CsvRecord): TranslationExchangeValue {
  return {
    text: record.targetText ?? '',
    ...(optional(record.state)
      ? { state: record.state as TranslationExchangeValue['state'] }
      : {}),
    ...(optional(record.note) ? { note: record.note } : {}),
  };
}

function formulaEscapingMarker(record: CsvRecord): string {
  const escapedColumns = TRANSLATION_CSV_COLUMNS.filter(
    (column) =>
      column !== 'escaping' &&
      isSpreadsheetDangerous(record[column] ?? ''),
  );
  return `${ESCAPING_VERSION}:${escapedColumns.join('|')}`;
}

function serializeRows(document: TranslationExchangeDocument): string {
  const normalized = validateTranslationExchangeDocument(document);
  const languages = [...new Set([
    ...normalized.targetLanguages,
    ...normalized.entries.flatMap((entry) => Object.keys(entry.translations)),
  ])].sort(compareText);
  if (languages.length === 0 && normalized.entries.length > 0) {
    throw new Error('Translation CSV export requires a target language.');
  }

  const records: CsvRecord[] = [];
  const entries = [...normalized.entries].sort((left, right) =>
    compareText(left.namespace ?? '', right.namespace ?? '') ||
    compareText(left.key, right.key),
  );
  for (const entry of entries) {
    for (const targetLanguage of languages) {
      const translation = entry.translations[targetLanguage];
      const record: CsvRecord = {
        schemaVersion: '1',
        appId: normalized.appId ?? '',
        branchId: normalized.branchId ?? '',
        sourceLanguage: normalized.sourceLanguage,
        targetLanguage,
        key: entry.key,
        namespace: entry.namespace ?? '',
        kind: entry.kind,
        sourceText: entry.sourceText,
        targetText: translation?.text ?? '',
        state: translation?.state ?? '',
        note: translation?.note ?? '',
        description: entry.description ?? '',
        format: entry.format,
        keyVersionId: entry.keyVersionId,
        sourceHash: entry.sourceHash,
        contractHash: entry.contractHash,
        argumentSignature: entry.argumentSignature,
        exportedAt: normalized.exportedAt ?? '',
        revisionWatermark: normalized.revisionWatermark ?? '',
        contractSetHash: normalized.contractSetHash ?? '',
      };
      record.escaping = formulaEscapingMarker(record);
      records.push(record);
    }
  }

  return [
    TRANSLATION_CSV_COLUMNS.join(','),
    ...records.map((record) =>
      TRANSLATION_CSV_COLUMNS.map((column) =>
        encodeCsvCell(record[column] ?? ''),
      ).join(','),
    ),
  ].join('\r\n');
}

export const translationCsvAdapter: TranslationFormatAdapter = {
  format: 'csv',

  sniff(input, fileName) {
    if (fileName?.toLowerCase().endsWith('.csv')) return true;
    try {
      const header = parseCsvRows(decodeUtf8(input))[0] ?? [];
      return REQUIRED_COLUMNS.every((column) => header.includes(column));
    } catch {
      return false;
    }
  },

  async parse(input) {
    return parseDocument(rowsToRecords(parseCsvRows(decodeUtf8(input))));
  },

  async serialize(document): Promise<SerializedTranslationDocument> {
    return {
      fileName: 'translations.csv',
      mediaType: 'text/csv;charset=utf-8',
      body: new TextEncoder().encode(serializeRows(document)),
    };
  },
};
