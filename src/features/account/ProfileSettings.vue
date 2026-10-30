<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { createProfileSettingsFlow } from './profile-settings-flow';
import { watchDialogFocusReturn } from '../dialogs/dialog-focus-return';

const props = defineProps<{ flow: ReturnType<typeof createProfileSettingsFlow>; local: boolean }>();
const flow = props.flow;
const state = flow.state;
const fileInput = ref<HTMLInputElement | null>(null);
const totpEnrollmentCode = ref<HTMLInputElement | null>(null);
const totpRecoveryAcknowledgement = ref<HTMLButtonElement | null>(null);
const totpStatus = ref<HTMLElement | null>(null);
const dialog = ref<HTMLElement | null>(null);

watchDialogFocusReturn(() => state.visible, () => document.querySelector<HTMLElement>('#accountButton'));

function close() {
  if (!state.visible) return;
  flow.close();
}

watch(() => state.visible, async visible => {
  if (!visible) return;
  await nextTick();
  if (state.visible) dialog.value?.focus();
});

watch(() => state.totpEnrollment, async enrollment => {
  if (!enrollment) return;
  await nextTick();
  if (state.visible && state.totpEnrollment === enrollment) totpEnrollmentCode.value?.focus();
});

watch(() => state.totpRecoveryCodes.length, async count => {
  await nextTick();
  if (!state.visible || state.totpRecoveryCodes.length !== count) return;
  if (count) totpRecoveryAcknowledgement.value?.focus();
  else if (state.totpEnabled) totpStatus.value?.focus();
});

function chooseAvatar() {
  fileInput.value?.click();
}

async function onAvatarFile(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0] || null;
  input.value = '';
  await flow.uploadAvatar(file);
}

function onPasswordSubmit() {
  return flow.submitPassword();
}

onBeforeUnmount(flow.dispose);
</script>

<template>
  <div
    id="profileSettingsOverlay"
    class="overlay"
    :class="{ open: state.visible }"
    @click.self="close"
    @keydown.esc.stop.prevent="close"
  >
    <section
      ref="dialog"
      class="dialog account-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profileSettingsTitle"
      tabindex="-1"
    >
      <div class="dialog-head">
        <h2 id="profileSettingsTitle">个人资料</h2>
        <button class="round-btn" data-close="profileSettingsOverlay" aria-label="关闭" @click="close">
          <span class="ico"><svg><use href="#i-close" /></svg></span>
        </button>
      </div>
      <div class="dialog-body account-settings-body">
        <section class="account-profile-section">
          <div class="account-profile-card">
            <div class="avatar-preview" id="profileAvatarPreview">
              <svg v-if="!state.avatarUrl" class="account-user-icon" aria-hidden="true"><use href="#i-user" /></svg>
              <img v-else id="profileAvatarImage" :src="state.avatarUrl" alt="">
            </div>
            <div class="profile-upload-actions">
              <strong id="profileUsername">{{ state.username }}</strong>
              <div class="profile-buttons">
                <button class="secondary-btn" id="chooseAvatar" type="button" :disabled="local || state.uploadingAvatar" @click="chooseAvatar">更换头像</button>
                <button
                  class="secondary-btn danger-btn"
                  id="removeAvatar"
                  type="button"
                  :disabled="local || !state.hasAvatar || state.removingAvatar"
                  :hidden="!state.hasAvatar"
                  @click="flow.clearAvatar"
                >移除头像</button>
                <input ref="fileInput" id="accountAvatarFile" type="file" accept="image/png,image/jpeg,image/webp" hidden :disabled="local || state.uploadingAvatar" @change="onAvatarFile">
              </div>
            </div>
          </div>
          <p id="profileSettingsMessage" class="account-settings-message" :class="{ success: state.profileMessageKind === 'success', error: state.profileMessageKind === 'error' }" role="status" aria-live="polite" :aria-busy="state.loadingProfile || state.uploadingAvatar || state.removingAvatar">
            {{ state.profileMessage }}
          </p>
          <div class="account-password-section">
            <h3>修改密码</h3>
            <p id="passwordChangeHint" class="hint">新密码至少 8 个字符，并包含大写字母、小写字母、数字、符号中的任意两类。</p>
            <form id="passwordChangeForm" @submit.prevent="onPasswordSubmit">
              <label class="form-label" for="currentPassword">当前密码</label>
              <input id="currentPassword" v-model="state.currentPassword" class="form-text" type="password" autocomplete="current-password" minlength="1" maxlength="128" required :disabled="local || state.changingPassword">
              <label class="form-label" for="newPassword">新密码</label>
              <input id="newPassword" v-model="state.newPassword" class="form-text" type="password" autocomplete="new-password" minlength="8" maxlength="128" required aria-describedby="passwordChangeHint" :disabled="local || state.changingPassword">
              <label class="form-label" for="confirmNewPassword">确认新密码</label>
              <input id="confirmNewPassword" v-model="state.confirmPassword" class="form-text" type="password" autocomplete="new-password" minlength="8" maxlength="128" required :disabled="local || state.changingPassword">
              <p id="passwordChangeMessage" class="account-settings-message" :class="{ success: state.passwordMessageKind === 'success', error: state.passwordMessageKind === 'error' }" role="status" aria-live="polite" :aria-busy="state.changingPassword">
                {{ state.passwordMessage }}
              </p>
              <button id="changePasswordButton" class="primary-btn" type="submit" :disabled="local || state.changingPassword">更新密码</button>
            </form>
          </div>
          <div class="account-password-section" id="accountTotpSection">
            <h3>两步验证</h3>
            <p class="hint">登录时除账号密码外，还需身份验证器验证码。启用前请确认设备时间准确，并妥善保存恢复码。</p>
            <p ref="totpStatus" id="totpStatus" class="account-settings-message" role="status" tabindex="-1">{{ state.totpEnabled ? '当前已启用' : '当前未启用' }}</p>
            <form v-if="!state.totpEnabled && !state.totpEnrollment" id="totpEnrollmentStartForm" @submit.prevent="flow.beginTotpEnrollment">
              <label class="form-label" for="totpPassword">当前密码</label>
              <input id="totpPassword" v-model="state.totpPassword" class="form-text" type="password" autocomplete="current-password" maxlength="128" required :disabled="local || state.changingTotp">
              <button id="beginTotpEnrollment" class="primary-btn" type="submit" :disabled="local || state.changingTotp">设置两步验证</button>
            </form>
            <div v-if="state.totpEnrollment" id="totpEnrollmentPending">
              <p class="hint">在身份验证器中添加账号 <strong>{{ state.username }}</strong>，或手动输入此密钥：</p>
              <p class="account-settings-message"><code id="totpManualSecret">{{ state.totpEnrollment.secret }}</code></p>
              <a id="totpAuthenticatorLink" :href="state.totpEnrollment.uri">打开身份验证器</a>
              <form id="totpEnrollmentConfirmForm" @submit.prevent="flow.confirmTotpEnrollment">
                <label class="form-label" for="totpEnrollmentCode">身份验证器验证码</label>
                <input ref="totpEnrollmentCode" id="totpEnrollmentCode" v-model="state.totpCode" class="form-text" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required :disabled="state.changingTotp" placeholder="6 位验证码">
                <button id="confirmTotpEnrollment" class="primary-btn" type="submit" :disabled="state.changingTotp">确认并启用</button>
              </form>
            </div>
            <div v-if="state.totpRecoveryCodes.length" id="totpRecoveryCodes">
              <p class="hint">每个恢复码只能使用一次。请保存到安全位置；关闭此窗口后将无法再次查看。</p>
              <ul><li v-for="code in state.totpRecoveryCodes" :key="code"><code>{{ code }}</code></li></ul>
              <button ref="totpRecoveryAcknowledgement" id="dismissTotpRecoveryCodes" class="secondary-btn" type="button" @click="flow.dismissTotpRecoveryCodes">我已保存恢复码</button>
            </div>
            <form v-if="state.totpEnabled && !state.totpRecoveryCodes.length" id="totpDisableForm" @submit.prevent="flow.disableTotp">
              <label class="form-label" for="totpDisablePassword">当前密码</label>
              <input id="totpDisablePassword" v-model="state.totpPassword" class="form-text" type="password" autocomplete="current-password" maxlength="128" required :disabled="local || state.changingTotp">
              <label class="form-label" for="totpDisableCode">身份验证器验证码或恢复码</label>
              <input id="totpDisableCode" v-model="state.totpCode" class="form-text" type="text" autocomplete="one-time-code" autocapitalize="characters" maxlength="64" required :disabled="state.changingTotp">
              <button id="disableTotp" class="secondary-btn danger-btn" type="submit" :disabled="local || state.changingTotp">关闭两步验证</button>
            </form>
            <p id="totpMessage" class="account-settings-message" :class="{ success: state.totpMessageKind === 'success', error: state.totpMessageKind === 'error' }" role="status" aria-live="polite" :aria-busy="state.changingTotp">{{ state.totpMessage }}</p>
          </div>
          <div class="account-password-section" id="browserExtensionSection">
            <h3>浏览器扩展</h3>
            <p class="hint">配对后，扩展仅可向此账号新增书签。令牌可随时撤销，且不会读取笔记或账号密码。</p>
            <form id="extensionPairingForm" @submit.prevent="flow.createExtensionPairing">
              <label class="form-label" for="extensionName">设备名称</label>
              <input id="extensionName" v-model="state.extensionName" class="form-text" type="text" maxlength="80" required :disabled="local || state.extensionSubmitting">
              <button id="createExtensionPairing" class="primary-btn" type="submit" :disabled="local || state.extensionSubmitting">生成配对码</button>
            </form>
            <div v-if="state.extensionPairing" id="extensionPairingCode">
              <p class="hint">配对码有效至 {{ new Date(state.extensionPairing.expires).toLocaleTimeString() }}，且只能使用一次。</p>
              <code>{{ state.extensionPairing.code }}</code>
              <button id="copyExtensionPairing" class="secondary-btn" type="button" @click="flow.copyExtensionPairingCode">复制配对码</button>
            </div>
            <div class="profile-buttons">
              <strong>已配对扩展</strong>
              <button id="refreshExtensionTokens" class="secondary-btn" type="button" :disabled="local || state.extensionLoading" @click="flow.refreshExtensionTokens">刷新</button>
            </div>
            <p v-if="state.extensionLoading" id="extensionTokensLoading" class="hint" role="status">正在读取扩展令牌…</p>
            <p v-else-if="!state.extensionTokens.length" id="extensionTokensEmpty" class="hint">暂无已配对扩展</p>
            <ul v-else id="extensionTokenList">
              <li v-for="token in state.extensionTokens" :key="token.id">
                <strong>{{ token.name }}</strong>
                <span> · 到期 {{ new Date(token.expires).toLocaleDateString() }}</span>
                <span v-if="token.lastUsed"> · 最近使用 {{ new Date(token.lastUsed).toLocaleString() }}</span>
                <span v-else> · 尚未使用</span>
                <template v-if="state.revokeExtensionTokenId === token.id">
                  <span> · 确认撤销？</span>
                  <button :data-confirm-revoke-extension="token.id" class="secondary-btn danger-btn" type="button" :disabled="state.extensionSubmitting" @click="flow.revokeExtensionToken(token.id)">确认</button>
                  <button class="secondary-btn" type="button" :disabled="state.extensionSubmitting" @click="state.revokeExtensionTokenId = ''">取消</button>
                </template>
                <button v-else :data-revoke-extension="token.id" class="secondary-btn danger-btn" type="button" :disabled="state.extensionSubmitting" @click="state.revokeExtensionTokenId = token.id">撤销</button>
              </li>
            </ul>
            <p id="extensionMessage" class="account-settings-message" :class="{ success: state.extensionMessageKind === 'success', error: state.extensionMessageKind === 'error' }" role="status" aria-live="polite" :aria-busy="state.extensionSubmitting || state.extensionLoading">{{ state.extensionMessage }}</p>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>
