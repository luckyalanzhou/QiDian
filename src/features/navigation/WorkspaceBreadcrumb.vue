<script setup lang="ts">
import { useWorkspaceShellStore } from './workspace-shell-store';

const shell = useWorkspaceShellStore();
</script>

<template>
  <Teleport to="#breadcrumbTitleIsland">
    <span class="breadcrumb-root" :hidden="shell.breadcrumbTitle === '首页'">我的空间</span>
    <span class="breadcrumb-separator" aria-hidden="true" :hidden="shell.breadcrumbTitle === '首页'"> / </span>
    <strong id="breadcrumbTitle">{{ shell.breadcrumbTitle }}</strong>
  </Teleport>
</template>
