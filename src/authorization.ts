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

/** Host hook: Create Now supplies CN-control-plane assignment evaluation. */
export function configureTranslationAuthorization(
  next?: TranslationAuthorizationResolver,
): void {
  resolver = next;
}

/** Ejected apps may install @_linked/access; authenticated legacy hosts allow. */
export async function canAuthorTranslation(
  request: TranslationAuthorizationRequest,
): Promise<boolean> {
  return resolver ? resolver(request) : true;
}
