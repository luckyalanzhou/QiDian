<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { createProfileSettingsFlow } from './profile-settings-flow';

const props = defineProps<{ flow: ReturnType<typeof createProfileSettingsFlow>; local: boolean }>();
const flow = props.flow;
const state = flow.state;
const fileInput = ref<HTMLInputElement | null>(null);
const dialog = ref<HTMLElement | null>(null);
let returnFocus: HTMLElement | null = null;

function close() {
  if (!state.visible) return;
  flow.close();
}

watch(() => state.visible, async visible => {
  if (visible) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    dialog.value?.focus();
    return;
  }
  void nextTick(() => returnFocus?.isConnected && returnFocus.focus({ preventScroll: true }));
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
            <p class="hint">新密码至少 8 个字符，并包含大写字母、小写字母、数字、符号中的任意两类。</p>
            <form id="passwordChangeForm" @submit.prevent="onPasswordSubmit">
              <label class="form-label" for="currentPassword">当前密码</label>
              <input id="currentPassword" v-model="state.currentPassword" class="form-text" type="password" autocomplete="current-password" minlength="1" maxlength="128" required :disabled="local || state.changingPassword">
              <label class="form-label" for="newPassword">新密码</label>
              <input id="newPassword" v-model="state.newPassword" class="form-text" type="password" autocomplete="new-password" minlength="8" maxlength="128" required :disabled="local || state.changingPassword">
              <label class="form-label" for="confirmNewPassword">确认新密码</label>
              <input id="confirmNewPassword" v-model="state.confirmPassword" class="form-text" type="password" autocomplete="new-password" minlength="8" maxlength="128" required :disabled="local || state.changingPassword">
              <p id="passwordChangeMessage" class="account-settings-message" :class="{ success: state.passwordMessageKind === 'success', error: state.passwordMessageKind === 'error' }" role="status" aria-live="polite" :aria-busy="state.changingPassword">
                {{ state.passwordMessage }}
              </p>
              <button id="changePasswordButton" class="primary-btn" type="submit" :disabled="local || state.changingPassword">更新密码</button>
            </form>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>
