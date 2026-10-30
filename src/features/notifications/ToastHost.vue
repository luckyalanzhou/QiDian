<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { useToastStore } from './store';

const store = useToastStore();
const host = document.querySelector<HTMLElement>('#toast');
let dismissTimer: number | undefined;

watch(() => store.visible, visible => host?.classList.toggle('show', visible), { immediate: true });
watch(() => store.revision, () => {
  window.clearTimeout(dismissTimer);
  if (store.visible) dismissTimer = window.setTimeout(() => store.dismiss(), 3000);
});

onBeforeUnmount(() => {
  window.clearTimeout(dismissTimer);
  host?.classList.remove('show');
});
</script>

<template>
  <Teleport to="#toast">
    <span v-if="store.visible" class="toast-message">{{ store.message }}</span>
  </Teleport>
</template>
