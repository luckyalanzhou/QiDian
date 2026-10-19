import { reactive } from 'vue';
import type { AccountProfile } from '../../api/contracts';

export type ProfileSettingsDependencies = {
  local: boolean;
  username: string;
  getAccountProfile: () => Promise<AccountProfile>;
  getAccountAvatar: () => Promise<Blob>;
  saveAccountAvatar: (file: Blob) => Promise<unknown>;
  removeAccountAvatar: () => Promise<unknown>;
  changeAccountPassword: (currentPassword: string, newPassword: string) => Promise<unknown>;
  onProfileChange?: (profile: AccountProfile, avatarUrl: string) => void;
  createAvatarUrl?: (blob: Blob) => string;
  revokeAvatarUrl?: (url: string) => void;
  processAvatar?: (file: File) => Promise<File>;
};

const avatarMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

async function processAvatar(file: File) {
  if (!file.type.startsWith('image/')) throw Error('请选择 PNG、JPEG 或 WebP 图片');
  if (!avatarMimeTypes.has(file.type)) throw Error('头像只支持 PNG、JPEG 或 WebP 图片');
  if (typeof createImageBitmap !== 'function') throw Error('当前浏览器无法处理头像图片');
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw Error('图片处理失败，请换一张图片');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const toWebp = (quality: number) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    let result = await toWebp(0.86);
    if (!result) throw Error('图片处理失败，请换一张图片');
    if (result.size > 512 * 1024) result = await toWebp(0.68);
    if (!result || result.size > 512 * 1024) throw Error('头像压缩后仍超过 512 KB');
    return new File([result], 'qidian-avatar.webp', { type: 'image/webp' });
  } finally {
    bitmap.close?.();
  }
}

export function createProfileSettingsFlow(dependencies: ProfileSettingsDependencies) {
  const state = reactive({
    visible: false,
    username: dependencies.username || '正在读取账号…',
    profile: null as AccountProfile | null,
    avatarUrl: '',
    hasAvatar: false,
    loadingProfile: false,
    uploadingAvatar: false,
    removingAvatar: false,
    changingPassword: false,
    profileMessage: '',
    profileMessageKind: '' as '' | 'success' | 'error',
    passwordMessage: '',
    passwordMessageKind: '' as '' | 'success' | 'error',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  function revokeAvatar() {
    if (state.avatarUrl) dependencies.revokeAvatarUrl?.(state.avatarUrl);
    state.avatarUrl = '';
  }

  function publishProfile() {
    if (state.profile) dependencies.onProfileChange?.(state.profile, state.avatarUrl);
  }

  async function refresh() {
    if (dependencies.local) {
      state.username = dependencies.username || '本地开发预览';
      return null;
    }
    state.loadingProfile = true;
    try {
      const profile = await dependencies.getAccountProfile();
      state.profile = profile;
      state.username = profile.username;
      state.hasAvatar = !!profile.avatarMime;
      revokeAvatar();
      if (profile.avatarMime) {
        try {
          const blob = await dependencies.getAccountAvatar();
          state.avatarUrl = (dependencies.createAvatarUrl || (value => URL.createObjectURL(value)))(blob);
        } catch {
          state.hasAvatar = false;
        }
      }
      publishProfile();
      return profile;
    } catch (error) {
      state.profileMessage = (error as Error)?.message || '暂时无法读取账号资料';
      state.profileMessageKind = 'error';
      throw error;
    } finally {
      state.loadingProfile = false;
    }
  }

  async function show() {
    state.visible = true;
    state.profileMessage = '';
    state.profileMessageKind = '';
    state.passwordMessage = '';
    state.passwordMessageKind = '';
    if (dependencies.local) {
      state.username = dependencies.username || '本地开发预览';
      state.profileMessage = '当前是本地界面预览；请登录部署后的栖点管理头像和密码。';
      state.profileMessageKind = 'error';
      return null;
    }
    state.username = dependencies.username || '正在读取账号…';
    try {
      return await refresh();
    } catch {
      return null;
    }
  }

  function close() {
    state.visible = false;
    state.currentPassword = '';
    state.newPassword = '';
    state.confirmPassword = '';
  }

  async function uploadAvatar(file: File | null) {
    if (!file || dependencies.local) return false;
    state.uploadingAvatar = true;
    state.profileMessage = '正在处理并上传头像…';
    state.profileMessageKind = '';
    try {
      await dependencies.saveAccountAvatar(await (dependencies.processAvatar || processAvatar)(file));
      await refresh();
      state.profileMessage = '头像已保存到 Docker 服务端';
      state.profileMessageKind = 'success';
      return true;
    } catch (error) {
      state.profileMessage = (error as Error)?.message || '头像上传失败';
      state.profileMessageKind = 'error';
      return false;
    } finally {
      state.uploadingAvatar = false;
    }
  }

  async function clearAvatar() {
    if (dependencies.local || !state.hasAvatar) return false;
    state.removingAvatar = true;
    state.profileMessage = '';
    state.profileMessageKind = '';
    try {
      await dependencies.removeAccountAvatar();
      await refresh();
      state.profileMessage = '头像已移除';
      state.profileMessageKind = 'success';
      return true;
    } catch (error) {
      state.profileMessage = (error as Error)?.message || '头像移除失败';
      state.profileMessageKind = 'error';
      return false;
    } finally {
      state.removingAvatar = false;
    }
  }

  async function submitPassword() {
    const { currentPassword, newPassword, confirmPassword } = state;
    state.passwordMessage = '';
    state.passwordMessageKind = '';
    if (newPassword !== confirmPassword) {
      state.passwordMessage = '两次输入的新密码不一致';
      state.passwordMessageKind = 'error';
      return false;
    }
    state.changingPassword = true;
    state.passwordMessage = '正在安全更新密码…';
    try {
      await dependencies.changeAccountPassword(currentPassword, newPassword);
      state.currentPassword = '';
      state.newPassword = '';
      state.confirmPassword = '';
      state.passwordMessage = '密码已更新，其他设备的登录已退出';
      state.passwordMessageKind = 'success';
      return true;
    } catch (error) {
      state.passwordMessage = (error as Error)?.message || '密码更新失败';
      state.passwordMessageKind = 'error';
      return false;
    } finally {
      state.changingPassword = false;
    }
  }

  function dispose() {
    revokeAvatar();
  }

  return { state, refresh, show, close, uploadAvatar, clearAvatar, submitPassword, dispose };
}
