<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { closeActionDialog } from './action-dialog-service';
import { useActionDialogStore } from './store';

const store = useActionDialogStore();
const dialog = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const confirmButton = ref<HTMLButtonElement | null>(null);

watch(() => store.visible, async visible => {
  if (!visible) return;
  await nextTick();
  (store.mode === 'prompt' ? input.value : confirmButton.value)?.focus();
});

function onKeydown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    closeActionDialog(false);
    return;
  }
  if (event.key === 'Enter') {
    if ((event.target as HTMLElement)?.closest('button')) return;
    event.preventDefault();
    closeActionDialog(true);
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = [...(dialog.value?.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])') || [])];
  const first = focusable[0], last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="store.visible" id="actionDialogOverlay" class="overlay action-dialog-overlay open" @mousedown.self="closeActionDialog(false)">
      <section
        id="actionDialogElement"
        ref="dialog"
        class="dialog action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="actionDialogTitle"
        aria-describedby="actionDialogMessage"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <div class="dialog-head"><h2 id="actionDialogTitle">{{ store.title }}</h2></div>
        <div class="dialog-body">
          <p id="actionDialogMessage" class="action-dialog-message">{{ store.message }}</p>
          <label v-if="store.mode === 'prompt'" id="actionDialogInputLabel" class="form-label" for="actionDialogInput">{{ store.inputLabel }}</label>
          <input
            v-if="store.mode === 'prompt'"
            id="actionDialogInput"
            class="form-text"
            type="text"
            autocomplete="off"
            :maxlength="store.maxLength"
            :value="store.inputValue"
            @input="store.setInputValue(($event.target as HTMLInputElement).value)"
          >
        </div>
        <div class="dialog-foot">
          <button id="actionDialogCancel" class="secondary-btn" type="button" @click="closeActionDialog(false)">{{ store.cancelText }}</button>
          <button id="actionDialogConfirm" ref="confirmButton" class="primary-btn" :class="{ 'danger-btn': store.danger }" type="button" @click="closeActionDialog(true)">{{ store.confirmText }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
