import type { AuthConfig } from '../../api/contracts';
import type { AuthenticationRecovery } from './authentication-flow';

type ShowAuthentication = (
  sessionConfig?: AuthConfig | null,
  recovery?: AuthenticationRecovery | null
) => Promise<unknown>;

export type ApplicationBootstrapOptions<Session> = {
  bootstrap: () => Promise<Session | null | undefined>;
  showAuthentication: ShowAuthentication;
  showStartupError: (error: unknown) => void;
  launchWorkspace: (session: Session, showAuthentication: ShowAuthentication) => void;
};

export async function bootstrapApplication<Session>(options: ApplicationBootstrapOptions<Session>) {
  let session: Session | null | undefined;
  try {
    session = await options.bootstrap();
  } catch (error) {
    const details = error && typeof error === 'object'
      ? error as { status?: unknown; details?: unknown }
      : null;
    if (details?.status === 401) await options.showAuthentication(details.details as AuthConfig | null | undefined);
    else options.showStartupError(error);
    return;
  }

  if (session) options.launchWorkspace(session, options.showAuthentication);
}
