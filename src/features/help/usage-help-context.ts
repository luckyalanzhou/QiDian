import type { NavigationPage } from '../navigation/store';

export function createUsageHelpContext(page: NavigationPage, editing: boolean) {
  if (page === 'bookmarks') return {
    title: '书签页',
    description: '搜索名称、网址或分组；展开分组访问书签。使用“批量整理”一次移动或删除多条书签。'
  };
  if (page === 'trash') return {
    title: '回收站',
    description: '选择内容后可还原；清空回收站会永久删除其中内容。'
  };
  if (page === 'home') return {
    title: '笔记列表',
    description: '按类型、最近编辑、重要收藏或草稿筛选；搜索可查找笔记标题与正文。'
  };
  if (page === 'note') return editing
    ? { title: '编辑笔记', description: '新笔记点击“发布笔记”，已有笔记点击“保存笔记”；仅在栖点内切换页面时，未保存修改会提示“保存并离开”或“取消”继续编辑。' }
    : { title: '阅读笔记', description: '点击正文目录跳到章节；使用“继续编辑”修改当前笔记。' };
  return {
    title: '首页',
    description: '查看最近笔记与常用书签，点击内容即可打开。'
  };
}
