import type { VaultData } from '../../../shared/api-contracts.js';
import type { VaultMutationPort } from '../vault/mutation.ts';

type Dependencies = {
  getVault: () => VaultData;
  mutateVault: VaultMutationPort;
};

export function createCategoryDialogFlow(dependencies: Dependencies) {
  async function save(input: string): Promise<string> {
    const name = input.trim();
    if (!name) throw new Error('请输入分类名称');
    if (name.length > 30) throw new Error('分类名称最多 30 个字符');
    if (dependencies.getVault().categories.includes(name)) throw new Error('这个分类已存在');

    const { persisted } = dependencies.mutateVault.execute(vault => {
      vault.categories.push(name);
    });
    await persisted;
    return name;
  }

  return { save };
}
