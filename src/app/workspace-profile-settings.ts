import type { useProfileSettingsStore } from '../features/account/profile-settings-store.ts';

type ProfileSettingsStore = ReturnType<typeof useProfileSettingsStore>;
type ProfileSettingsDependencies = Parameters<ProfileSettingsStore['configure']>[0];
type ProfileSettingsApi = Omit<ProfileSettingsDependencies, 'local' | 'username' | 'onProfileChange'>;

type WorkspaceProfileSettingsDependencies = {
  store: ProfileSettingsStore;
  local: boolean;
  username: string;
  api: ProfileSettingsApi;
  identity: {
    setUsername: (username: string, local: boolean) => void;
    setAvatar: (avatarUrl: string) => void;
  };
};

export function createWorkspaceProfileSettings(dependencies: WorkspaceProfileSettingsDependencies) {
  const profile: ProfileSettingsDependencies = {
    local: dependencies.local,
    username: dependencies.username,
    ...dependencies.api,
    onProfileChange: (accountProfile, avatarUrl) => {
      dependencies.identity.setUsername(accountProfile.username, dependencies.local);
      dependencies.identity.setAvatar(avatarUrl);
    }
  };

  dependencies.store.configure(profile);
  return dependencies.store;
}
