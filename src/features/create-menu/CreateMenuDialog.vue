<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useNavigationActionsStore } from '../navigation/navigation-actions-store';
import { useCreateMenuStore } from './store';

const store = useCreateMenuStore();
const navigationActions = useNavigationActionsStore();
const firstOption = ref<HTMLButtonElement | null>(null);
let returnFocus: HTMLElement | null = null;
let transition = 0;

watch(() => store.visible, async visible => {
  const request = ++transition;
  if (visible) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    if (request === transition && store.visible) firstOption.value?.focus();
    return;
  }

  await nextTick();
  if (request !== transition || store.visible) return;
  if (store.restoreFocusOnClose && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
});

function select(kind: 'note' | 'bookmark' | 'capture') {
  navigationActions.execute({ type: 'create-from-menu', kind });
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="store.visible"
      id="createFeatureOverlay"
      class="overlay open"
      @mousedown.self="store.close"
      @keydown.esc.stop.prevent="store.close"
    >
      <section class="dialog create-dialog" role="dialog" aria-modal="true" aria-labelledby="createFeatureTitle">
        <div class="dialog-head">
          <h2 id="createFeatureTitle">新建</h2>
          <button class="round-btn" type="button" aria-label="关闭" @click.stop="store.close">
            <span class="ico"><svg><use href="#i-close" /></svg></span>
          </button>
        </div>
        <div class="dialog-body create-options">
          <button ref="firstOption" type="button" data-create-kind="note" @click.stop="select('note')">
            <span class="ico"><svg><use href="#i-note" /></svg></span>
            <span><strong>笔记</strong><small>记录内容、命令与图片</small></span>
          </button>
          <button type="button" data-create-kind="bookmark" @click.stop="select('bookmark')">
            <span class="ico"><svg><use href="#i-link" /></svg></span>
            <span><strong>书签</strong><small>保存网址并选择分组</small></span>
          </button>
          <button type="button" data-create-kind="capture" @click.stop="select('capture')">
            <span class="ico"><svg><use href="#i-clip" /></svg></span>
            <span><strong>网页摘录</strong><small>将复制的内容整理为笔记</small></span>
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
