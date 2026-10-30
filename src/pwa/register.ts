export type PwaRegistrationEnvironment = {
  production: boolean;
  secureContext: boolean;
  serviceWorkerAvailable: boolean;
};

export function shouldRegisterPwa(environment: PwaRegistrationEnvironment) {
  return environment.production && environment.secureContext && environment.serviceWorkerAvailable;
}

export function registerPwa(
  environment: PwaRegistrationEnvironment,
  serviceWorker?: Pick<ServiceWorkerContainer, 'register'>
) {
  if (!shouldRegisterPwa(environment) || !serviceWorker) return Promise.resolve(null);
  return serviceWorker.register('/sw.js', { scope: '/' });
}
