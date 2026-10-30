<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { watchDialogFocusReturn } from '../dialogs/dialog-focus-return';
import { useNavigationStore } from '../navigation/store';
import { createUsageHelpContext } from './usage-help-context';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLElement | null>(null);
const helpSearch = ref('');
const navigation = useNavigationStore();
const currentPageHelp = computed(() => createUsageHelpContext(navigation.page, navigation.editing));
type HelpTopic = {
  title: string;
  description?: string;
  items?: Array<{ label: string; text: string }>;
};
const helpTopics: HelpTopic[] = [
  {
    title: '写作与维护笔记',
    items: [
      { label: '新建', text: '填写内容后点“发布笔记”；空白内容不会进入草稿箱。' },
      { label: '编辑', text: '已有笔记点“保存笔记”。在栖点内切换页面时，如果有未保存修改，可选“保存并离开”或“取消”继续编辑。' },
      { label: '格式', text: '工具栏可设置段落、列表和表格；粘贴菜单可保留网页格式或 Markdown 原文，也可转换为富文本或纯文本。“显示原文”可查看 Markdown。' }
    ]
  },
  {
    title: '收藏与整理书签',
    items: [
      { label: '添加与分组', text: '在书签页添加书签和分组；从“书签更多操作”中导入或导出浏览器书签 HTML。' },
      { label: '导入与删除', text: '导入前可查看新增、重复、跳过数量和分组预览；删除的内容可在回收站中还原。' }
    ]
  },
  {
    title: '查找知识',
    description: '点击桌面顶栏或手机底部导航中的搜索，可查笔记标题与正文、书签名称、网址和分组。桌面也可按 Ctrl/⌘+K 打开搜索。'
  },
  {
    title: '备份与恢复知识库',
    items: [
      { label: '保存备份', text: '在账号菜单的“设置”→“备份与迁移”中导出完整 ZIP，并下载到电脑、手机或其他与服务器分开的存储位置。' },
      { label: '恢复数据', text: '查看或恢复服务器保存的版本，打开“历史快照”。导入完整备份或恢复历史快照都会替换当前知识库。' },
      { label: '保护数据', text: '服务器会在操作前创建同盘回滚副本，但它不能替代保存在其他设备上的备份。' }
    ]
  }
];
const visibleHelpTopics = computed(() => {
  const query = helpSearch.value.trim().toLocaleLowerCase();
  if (!query) return helpTopics;
  return helpTopics.flatMap(topic => {
    if (topic.title.toLocaleLowerCase().includes(query)) return [topic];
    const description = topic.description?.toLocaleLowerCase().includes(query)
      ? topic.description
      : undefined;
    const items = topic.items?.filter(item => `${item.label} ${item.text}`.toLocaleLowerCase().includes(query));
    if (description || items?.length) return [{ ...topic, ...(description ? { description } : {}), ...(items ? { items } : {}) }];
    return [];
  });
});
const currentPageHelpVisible = computed(() => {
  const query = helpSearch.value.trim().toLocaleLowerCase();
  return !query || `${currentPageHelp.value.title} ${currentPageHelp.value.description}`.toLocaleLowerCase().includes(query);
});
const noHelpResults = computed(() => !currentPageHelpVisible.value && visibleHelpTopics.value.length === 0);

watchDialogFocusReturn(
  () => props.open,
  () => document.querySelector<HTMLElement>('#accountButton')
);

watch(() => props.open, async open => {
  if (!open) return;
  await nextTick();
  dialog.value?.focus();
});

function close() {
  emit('close');
}

</script>

<template>
  <Teleport to="body">
    <div v-if="open" id="usageHelpOverlay" class="overlay open" @click.self="close" @keydown.esc.stop.prevent="close">
      <section
        ref="dialog"
        id="usageHelpDialog"
        class="dialog account-dialog usage-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="usageHelpTitle"
        aria-describedby="usageHelpSummary"
        tabindex="-1"
      >
        <div class="dialog-head">
          <div>
            <h2 id="usageHelpTitle">使用帮助</h2>
            <p id="usageHelpSummary" class="account-dialog-subtitle">笔记、书签、搜索和数据备份的基本操作。</p>
          </div>
          <button class="round-btn" type="button" aria-label="关闭使用帮助" @click="close">
            <span class="ico"><svg aria-hidden="true"><use href="#i-close" /></svg></span>
          </button>
        </div>
        <div class="dialog-body usage-help-body">
          <div class="usage-help-search-field">
            <label class="usage-help-search-label" for="usageHelpSearch">查找操作说明</label>
            <input id="usageHelpSearch" v-model="helpSearch" class="auth-input usage-help-search" type="search" aria-label="搜索使用帮助" placeholder="例如：保存、导入书签、恢复" autocomplete="off">
          </div>
          <section v-if="currentPageHelpVisible" class="usage-help-section" aria-label="当前页面说明">
            <h3>当前页面 · {{ currentPageHelp.title }}</h3>
            <p>{{ currentPageHelp.description }}</p>
          </section>
          <section v-for="topic in visibleHelpTopics" :key="topic.title" class="usage-help-section">
            <h3>{{ topic.title }}</h3>
            <p v-if="topic.description">{{ topic.description }}</p>
            <ul v-if="topic.items">
              <li v-for="item in topic.items" :key="item.label"><strong>{{ item.label }}：</strong>{{ item.text }}</li>
            </ul>
          </section>
          <p v-if="noHelpResults" class="usage-help-no-results" role="status">没有找到相关说明。试试“保存”“导入”或“恢复”。</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>
