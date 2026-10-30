import type { VaultData } from '../../../shared/api-contracts.js';
import { validateVault } from '../../../shared/vault-validation.js';

export type VaultMutationPort = {
  execute<T>(operation: (candidate: VaultData) => T): { result: T; persisted: Promise<void> };
};

type Dependencies = {
  getVault: () => VaultData;
  replaceVault: (vault: VaultData) => VaultData;
  save: () => Promise<unknown>;
};

export function createVaultMutation(dependencies: Dependencies): VaultMutationPort {
  function execute<T>(operation: (candidate: VaultData) => T) {
    const previous = structuredClone(dependencies.getVault());
    const candidate = structuredClone(previous);
    const result = operation(candidate);
    const applied = dependencies.replaceVault(validateVault(candidate));
    let saving: Promise<unknown>;
    try {
      saving = dependencies.save();
    } catch (error) {
      saving = Promise.reject(error);
    }
    const persisted = Promise.resolve(saving).then(() => undefined).catch(error => {
      if (dependencies.getVault() === applied) dependencies.replaceVault(previous);
      throw error;
    });
    return { result, persisted };
  }

  return { execute };
}
