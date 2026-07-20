import { ShapeProvider } from '@_linked/server-utils/utils/ShapeProvider';
import { TranslationKey } from './TranslationKey.js';
import { TranslationUnit } from './TranslationUnit.js';

export interface TranslationKeyInput {
  appId: string;
  key: string;
  sourceText: string;
  namespace?: string;
  description?: string;
  kind?: 'ui' | 'content';
  ofNode?: string;
  ofField?: string;
  format?: 'simple' | 'icu';
}

export interface TranslationUnitInput {
  appId: string;
  key: string;
  language: string;
  text: string;
  state?: 'untranslated' | 'machine' | 'reviewed' | 'stale';
  updatedBy?: string;
}

function requireText(value: string, label: string): string {
  const clean = value?.trim();
  if (!clean) throw new Error(`${label} is required.`);
  return clean;
}

function keyIri(appId: string, key: string): string {
  return `${appId.replace(/\/$/, '')}/translation/key/${encodeURIComponent(key)}`;
}

function unitIri(appId: string, key: string, language: string): string {
  return `${keyIri(appId, key)}/unit/${encodeURIComponent(language)}`;
}

/** Server boundary for app-scoped translation keys and language units. */
export class TranslationProvider extends ShapeProvider {
  public shape = TranslationKey;

  async listKeys(data: { appId: string }) {
    const appId = requireText(data.appId, 'appId');
    return TranslationKey.select((k) => [
      k.namespace,
      k.key,
      k.sourceText,
      k.description,
      k.kind,
      k.ofNode,
      k.ofField,
      k.format,
    ]).where((k) => k.ofApplication.equals({ id: appId } as any));
  }

  async upsertKey(data: TranslationKeyInput): Promise<{ id: string }> {
    const appId = requireText(data.appId, 'appId');
    const key = requireText(data.key, 'key');
    requireText(data.sourceText, 'sourceText');
    const id = keyIri(appId, key);
    const values = {
      namespace: data.namespace ?? key.split('.').slice(0, -1).join('.'),
      key,
      sourceText: data.sourceText,
      description: data.description,
      kind: data.kind ?? 'ui',
      ofApplication: { id: appId },
      ofNode: data.ofNode ? { id: data.ofNode } : undefined,
      ofField: data.ofField,
      format: data.format ?? 'simple',
    } as any;
    const existing = await TranslationKey.select((k) => [k.sourceText])
      .where((k) => k.equals({ id } as any))
      .one()
      .catch(() => null);
    if (existing) {
      await TranslationKey.update(values).for({ id } as any);
      if ((existing as any).sourceText !== data.sourceText) {
        await TranslationUnit.update({ state: 'stale' } as any).where((u) =>
          u.ofKey.equals({ id } as any),
        );
      }
    }
    else await TranslationKey.create({ __id: id, ...values });
    return { id };
  }

  async upsertUnit(data: TranslationUnitInput): Promise<{ id: string }> {
    const appId = requireText(data.appId, 'appId');
    const key = requireText(data.key, 'key');
    const language = requireText(data.language, 'language');
    const id = unitIri(appId, key, language);
    const keyId = keyIri(appId, key);
    const existingKey = await TranslationKey.select()
      .where((k) => k.equals({ id: keyId } as any))
      .one()
      .catch(() => null);
    if (!existingKey) throw new Error(`Translation key "${key}" does not exist for this app.`);
    const values = {
      ofKey: { id: keyId },
      language,
      text: data.text,
      state: data.state ?? 'reviewed',
      updatedAt: new Date().toISOString(),
      updatedBy: data.updatedBy ? { id: data.updatedBy } : undefined,
    } as any;
    const existing = await TranslationUnit.select()
      .where((u) => u.equals({ id } as any))
      .one()
      .catch(() => null);
    if (existing) await TranslationUnit.update(values).for({ id } as any);
    else await TranslationUnit.create({ __id: id, ...values });
    return { id };
  }

  async getMessages(data: { appId: string; language: string }): Promise<Record<string, string>> {
    const appId = requireText(data.appId, 'appId');
    const language = requireText(data.language, 'language');
    const rows = await TranslationUnit.select((u) => [
      u.text,
      u.ofKey.select((k) => [k.key]),
    ]).where((u) =>
      u.language
        .equals(language)
        .and(u.ofKey.ofApplication.equals({ id: appId } as any)),
    );
    return Object.fromEntries(
      (rows ?? [])
        .map((row: any) => [row.ofKey?.key, row.text] as const)
        .filter(([key]) => typeof key === 'string' && key.length > 0),
    );
  }
}
