export type TranslationAuthoringAction =
  | 'manage'
  | 'review'
  | 'propose'
  | 'run-mt'
  | 'read';

export interface TranslationAuthorizationRequest {
  appId: string;
  actorWebId: string;
  action: TranslationAuthoringAction;
  language?: string;
}

export type TranslationAuthorizationResolver = (
  request: TranslationAuthorizationRequest,
) => Promise<boolean>;

let resolver: TranslationAuthorizationResolver | undefined;

/**
 * Host hook: the host decides who may read and author an app's translations
 * (Create Now evaluates its translator assignments and project roles here).
 *
 * The resolver is the only source of a "yes". A host that does not configure
 * one gets no authoring or read access over the translation provider; only the
 * public runtime fetch (`getMessages`) keeps working.
 */
export function configureTranslationAuthorization(
  next?: TranslationAuthorizationResolver,
): void {
  resolver = next;
}

/**
 * Whether the host's resolver grants `request`. Denies when no resolver is
 * configured, and when the resolver throws or answers anything but `true`.
 */
export async function canAuthorTranslation(
  request: TranslationAuthorizationRequest,
): Promise<boolean> {
  if (!resolver) return false;
  try {
    return (await resolver(request)) === true;
  } catch (error) {
    console.warn('[translation] authorization resolver failed; denying.', error);
    return false;
  }
}
