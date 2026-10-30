<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useCategoryDialogStore } from './category-dialog-store';

const store = useCategoryDialogStore();
const nameInput = ref<HTMLInputElement | null>(null);
let returnFocus: HTMLElement | null = null;

watch(() => store.visible, async visible => {
  if (visible) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    nameInput.value?.focus();
    return;
  }
  await nextTick();
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="store.visible"
      id="categoryFeatureOverlay"
      class="overlay open"
      @mousedown.self="store.close"
      @keydown.esc.stop.prevent="store.close"
    >
      <form
        class="dialog type-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="categoryFeatureTitle"
        @submit.prevent="store.submit"
      >
        <div class="dialog-head">
          <h2 id="categoryFeatureTitle">新增分类</h2>
          <button class="round-btn" type="button" aria-label="关闭" :disabled="store.saving" @click.stop="store.close">
            <span class="ico"><svg><use href="#i-close" /></svg></span>
          </button>
        </div>
        <div class="dialog-body">
          <label class="form-label" for="categoryFeatureName">分类名称</label>
          <input
            id="categoryFeatureName"
            ref="nameInput"
            v-model="store.name"
            class="form-text"
            maxlength="30"
            placeholder="例如：工作"
            aria-describedby="categoryFeatureMessage"
            :disabled="store.saving"
          >
          <p id="categoryFeatureMessage" class="hint" role="status" aria-live="polite">{{ store.message }}</p>
        </div>
        <div class="dialog-foot">
          <button class="secondary-btn" type="button" :disabled="store.saving" @click.stop="store.close">取消</button>
          <button class="primary-btn" type="submit" :disabled="store.saving">{{ store.saving ? '保存中…' : '创建分类' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
