<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useNoteTypeDialogStore, type NoteTypeDialogSubmission } from './type-dialog-store';
import { firstRestorableFocusTarget, watchDialogFocusReturn } from '../dialogs/dialog-focus-return';

const store = useNoteTypeDialogStore();
const nameInput = ref<HTMLInputElement | null>(null);
const replacementInput = ref<HTMLSelectElement | null>(null);

watchDialogFocusReturn(
  () => store.visible,
  () => firstRestorableFocusTarget(document.querySelectorAll<HTMLElement>('#menuBtn, #searchTop, #mobileSearch'))
);

watch(() => store.visible, async visible => {
  if (!visible) return;
  await nextTick();
  (store.mode === 'delete' ? replacementInput.value : nameInput.value)?.focus();
});

function close() {
  store.close();
}

function submit() {
  const input: NoteTypeDialogSubmission = store.mode === 'delete'
    ? { mode: store.mode, id: store.id, targetId: replacementInput.value?.value || '' }
    : { mode: store.mode, id: store.id, name: nameInput.value?.value || '' };
  return store.submit(input);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="store.visible"
      id="typeOverlay"
      class="overlay open"
      @mousedown.self="close"
      @keydown.esc.stop.prevent="close"
    >
      <section
        ref="dialog"
        class="dialog type-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="typeDialogTitle"
        tabindex="-1"
      >
        <div class="dialog-head">
          <h2 id="typeDialogTitle">{{ store.title }}</h2>
          <button class="round-btn" type="button" aria-label="关闭" @click.stop="close"><span class="ico"><svg><use href="#i-close" /></svg></span></button>
        </div>
        <div class="dialog-body" id="typeDialogBody">
          <template v-if="store.mode === 'delete'">
            <p class="type-delete-copy">“{{ store.name }}”下有 <strong>{{ store.noteCount }}</strong> 篇笔记。删除类型时，笔记会保留并转移到：</p>
            <label class="form-label" for="typeReplacement">转移到类型</label>
            <select id="typeReplacement" ref="replacementInput" class="form-text">
              <option v-for="option in store.options" :key="option.id" :value="option.id">{{ option.name }}{{ option.autoCreate ? '（自动创建）' : '' }}</option>
            </select>
          </template>
          <template v-else>
            <label class="form-label" for="typeNameInput">类型名称</label>
            <input id="typeNameInput" ref="nameInput" class="form-text" maxlength="30" :value="store.name" placeholder="例如：读书笔记" @keydown.enter.stop.prevent="submit">
            <p class="hint">类型名称会显示在左侧导航和笔记筛选中。</p>
          </template>
        </div>
        <div class="dialog-foot">
          <span class="hint" id="typeDialogHint">{{ store.hint }}</span>
          <button class="secondary-btn" type="button" @click.stop="close">取消</button>
          <button
            id="typeDialogConfirm"
            class="primary-btn"
            :class="{ 'danger-btn': store.mode === 'delete' }"
            type="button"
            @click.stop="submit"
          >{{ store.mode === 'create' ? '创建类型' : store.mode === 'edit' ? '保存修改' : '删除类型' }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
