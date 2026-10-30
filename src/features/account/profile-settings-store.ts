import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { createProfileSettingsFlow, type ProfileSettingsDependencies } from './profile-settings-flow';

type ProfileSettingsFlow = ReturnType<typeof createProfileSettingsFlow>;

export const useProfileSettingsStore = defineStore('profile-settings', () => {
  const configured = ref(false);
  const local = ref(true);
  const revision = ref(0);
  const controller = shallowRef<ProfileSettingsFlow | null>(null);

  function configure(dependencies: ProfileSettingsDependencies) {
    controller.value?.dispose();
    local.value = dependencies.local;
    controller.value = createProfileSettingsFlow(dependencies);
    configured.value = true;
    revision.value += 1;
  }

  function show() {
    return controller.value?.show() ?? Promise.resolve(null);
  }

  function close() {
    controller.value?.close();
  }

  function refresh() {
    return controller.value?.refresh() ?? Promise.resolve(null);
  }

  return { configured, local, revision, controller, configure, show, close, refresh };
});
