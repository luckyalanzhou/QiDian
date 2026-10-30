type SignOutFlowDependencies = {
  isEditing: () => boolean;
  clearAutosave: () => void;
  saveDraft: () => unknown;
  flush: () => Promise<boolean>;
  logout: () => Promise<void>;
  reload: () => void;
  notify: (message: string) => void;
};

export function createSignOutFlow(dependencies: SignOutFlowDependencies) {
  async function run(): Promise<boolean> {
    if (dependencies.isEditing()) {
      dependencies.clearAutosave();
      dependencies.saveDraft();
    }

    if (!await dependencies.flush()) {
      dependencies.notify('修改暂未写入；请到设置中重试保存后再退出');
      return false;
    }

    try {
      await dependencies.logout();
      dependencies.reload();
      return true;
    } catch (error) {
      dependencies.notify(error instanceof Error ? error.message : '退出登录失败');
      return false;
    }
  }

  return { run };
}
