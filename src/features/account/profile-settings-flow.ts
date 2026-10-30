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
  beginTotpEnrollment: (currentPassword: string) => Promise<{ pendingId: string; secret: string; uri: string }>;
  confirmTotpEnrollment: (pendingId: string, code: string) => Promise<{ enabled: true; recoveryCodes: string[] }>;
  disableTotp: (currentPassword: string, code: string) => Promise<unknown>;
  createExtensionPairingCode: (name: string) => Promise<{ code: string; name: string; expires: number }>;
  listExtensionTokens: () => Promise<{ tokens: ExtensionToken[] }>;
  revokeExtensionToken: (id: string) => Promise<unknown>;
  copyText?: (value: string) => Promise<void>;
  onProfileChange?: (profile: AccountProfile, avatarUrl: string) => void;
  createAvatarUrl?: (blob: Blob) => string;
  revokeAvatarUrl?: (url: string) => void;
  processAvatar?: (file: File) => Promise<File>;
};

export type ExtensionToken = { id: string; name: string; created: number; lastUsed: number | null; expires: number };

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
    ,totpEnabled: false,
    totpEnrollment: null as { pendingId: string; secret: string; uri: string } | null,
    totpRecoveryCodes: [] as string[],
    totpPassword: '',
    totpCode: '',
    changingTotp: false,
    totpMessage: '',
    totpMessageKind: '' as '' | 'success' | 'error',
    extensionName: 'Chrome 扩展',
    extensionPairing: null as { code: string; name: string; expires: number } | null,
    extensionTokens: [] as ExtensionToken[],
    extensionLoading: false,
    extensionSubmitting: false,
    extensionMessage: '',
    extensionMessageKind: '' as '' | 'success' | 'error',
    revokeExtensionTokenId: ''
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
      state.totpEnabled = profile.totpEnabled === true;
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

  async function refreshExtensionTokens() {
    if (dependencies.local) return [];
    state.extensionLoading = true;
    try {
      const result = await dependencies.listExtensionTokens();
      state.extensionTokens = result.tokens;
      return result.tokens;
    } catch (error) {
      state.extensionMessage = (error as Error)?.message || '无法读取扩展令牌';
      state.extensionMessageKind = 'error';
      return [];
    } finally {
      state.extensionLoading = false;
    }
  }

  async function show() {
    state.visible = true;
    state.profileMessage = '';
    state.profileMessageKind = '';
    state.passwordMessage = '';
    state.passwordMessageKind = '';
    state.totpMessage = '';
    state.totpMessageKind = '';
    state.totpRecoveryCodes = [];
    state.totpEnrollment = null;
    state.totpPassword = '';
    state.totpCode = '';
    state.extensionPairing = null;
    state.extensionMessage = '';
    state.extensionMessageKind = '';
    state.revokeExtensionTokenId = '';
    if (dependencies.local) {
      state.username = dependencies.username || '本地开发预览';
      state.profileMessage = '当前是本地界面预览；请登录部署后的栖点管理头像和密码。';
      state.profileMessageKind = 'error';
      return null;
    }
    state.username = dependencies.username || '正在读取账号…';
    try {
      const profile = await refresh();
      await refreshExtensionTokens();
      return profile;
    } catch {
      return null;
    }
  }

  function close() {
    state.visible = false;
    state.currentPassword = '';
    state.newPassword = '';
    state.confirmPassword = '';
    state.totpPassword = '';
    state.totpCode = '';
    state.totpRecoveryCodes = [];
    state.totpEnrollment = null;
    state.extensionPairing = null;
    state.revokeExtensionTokenId = '';
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

  async function beginTotpEnrollment() {
    if (dependencies.local || state.totpEnabled || state.changingTotp || !state.totpPassword) return false;
    state.changingTotp = true;
    state.totpMessage = '正在验证密码并准备两步验证…';
    state.totpMessageKind = '';
    try {
      state.totpEnrollment = await dependencies.beginTotpEnrollment(state.totpPassword);
      state.totpPassword = '';
      state.totpCode = '';
      state.totpMessage = '请把密钥添加到身份验证器，再输入当前验证码确认。';
      return true;
    } catch (error) {
      state.totpMessage = (error as Error)?.message || '无法开始设置两步验证';
      state.totpMessageKind = 'error';
      return false;
    } finally {
      state.changingTotp = false;
    }
  }

  async function confirmTotpEnrollment() {
    if (dependencies.local || !state.totpEnrollment || state.changingTotp) return false;
    state.changingTotp = true;
    state.totpMessage = '正在确认验证码…';
    state.totpMessageKind = '';
    try {
      const result = await dependencies.confirmTotpEnrollment(state.totpEnrollment.pendingId, state.totpCode.trim());
      state.totpEnabled = true;
      state.totpEnrollment = null;
      state.totpPassword = '';
      state.totpCode = '';
      state.totpRecoveryCodes = result.recoveryCodes;
      state.totpMessage = '两步验证已启用。请先保存下方恢复码；它们只显示这一次。';
      state.totpMessageKind = 'success';
      return true;
    } catch (error) {
      state.totpMessage = (error as Error)?.message || '两步验证启用失败';
      state.totpMessageKind = 'error';
      return false;
    } finally {
      state.changingTotp = false;
    }
  }

  function dismissTotpRecoveryCodes() {
    state.totpRecoveryCodes = [];
    state.totpMessage = '恢复码已从页面清除；如未保存，请使用设备管理员恢复流程。';
    state.totpMessageKind = 'error';
  }

  async function disableTotp() {
    if (dependencies.local || !state.totpEnabled || state.changingTotp) return false;
    state.changingTotp = true;
    state.totpMessage = '正在验证密码和验证码…';
    state.totpMessageKind = '';
    try {
      await dependencies.disableTotp(state.totpPassword, state.totpCode.trim());
      state.totpEnabled = false;
      state.totpPassword = '';
      state.totpCode = '';
      state.totpRecoveryCodes = [];
      state.totpMessage = '两步验证已关闭';
      state.totpMessageKind = 'success';
      return true;
    } catch (error) {
      state.totpMessage = (error as Error)?.message || '关闭两步验证失败';
      state.totpMessageKind = 'error';
      return false;
    } finally {
      state.changingTotp = false;
    }
  }

  async function createExtensionPairing() {
    if (dependencies.local || state.extensionSubmitting) return false;
    state.extensionSubmitting = true;
    state.extensionMessage = '';
    state.extensionMessageKind = '';
    try {
      state.extensionPairing = await dependencies.createExtensionPairingCode(state.extensionName.trim());
      state.extensionMessage = '配对码仅显示 5 分钟。完成扩展配对后，刷新下方令牌列表即可管理或撤销。';
      state.extensionMessageKind = 'success';
      return true;
    } catch (error) {
      state.extensionMessage = (error as Error)?.message || '生成扩展配对码失败';
      state.extensionMessageKind = 'error';
      return false;
    } finally {
      state.extensionSubmitting = false;
    }
  }

  async function copyExtensionPairingCode() {
    if (!state.extensionPairing) return false;
    try {
      await (dependencies.copyText || (value => navigator.clipboard.writeText(value)))(state.extensionPairing.code);
      state.extensionMessage = '配对码已复制';
      state.extensionMessageKind = 'success';
      return true;
    } catch {
      state.extensionMessage = '复制失败，请手动选择配对码复制';
      state.extensionMessageKind = 'error';
      return false;
    }
  }

  async function revokeExtensionToken(id: string) {
    if (dependencies.local || state.extensionSubmitting || !state.extensionTokens.some(token => token.id === id)) return false;
    state.extensionSubmitting = true;
    try {
      await dependencies.revokeExtensionToken(id);
      state.extensionTokens = state.extensionTokens.filter(token => token.id !== id);
      state.revokeExtensionTokenId = '';
      state.extensionMessage = '扩展令牌已撤销';
      state.extensionMessageKind = 'success';
      return true;
    } catch (error) {
      state.extensionMessage = (error as Error)?.message || '撤销扩展令牌失败';
      state.extensionMessageKind = 'error';
      return false;
    } finally {
      state.extensionSubmitting = false;
    }
  }

  function dispose() {
    revokeAvatar();
  }

  return { state, refresh, show, close, uploadAvatar, clearAvatar, submitPassword, beginTotpEnrollment, confirmTotpEnrollment,
    dismissTotpRecoveryCodes, disableTotp, refreshExtensionTokens, createExtensionPairing, copyExtensionPairingCode,
    revokeExtensionToken, dispose };
}
