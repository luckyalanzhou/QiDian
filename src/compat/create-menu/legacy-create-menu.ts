export type LegacyCreateMenuDependencies = {
  document: Document;
  icons: (name: string) => string;
};

export function createLegacyCreateMenu({ document, icons }: LegacyCreateMenuDependencies) {
  function open() {
    if (!document.querySelector('#createOverlay')) {
      document.body.insertAdjacentHTML('beforeend', `<div class="overlay" id="createOverlay"><section class="dialog create-dialog" role="dialog" aria-modal="true" aria-labelledby="createTitle"><div class="dialog-head"><h2 id="createTitle">新建</h2><button class="round-btn" data-close="createOverlay" aria-label="关闭">${icons('close')}</button></div><div class="dialog-body create-options"><button data-create-kind="note">${icons('note')}<span><strong>笔记</strong><small>记录内容、命令与图片</small></span></button><button data-create-kind="bookmark">${icons('link')}<span><strong>书签</strong><small>保存网址并选择分组</small></span></button><button data-create-kind="capture">${icons('clip')}<span><strong>网页摘录</strong><small>将复制的内容整理为笔记</small></span></button></div></section></div>`);
    }

    const overlay = document.querySelector<HTMLElement>('#createOverlay');
    overlay?.classList.add('open');
    overlay?.querySelector<HTMLElement>('[data-create-kind]')?.focus();
  }

  function close() {
    document.querySelector('#createOverlay')?.classList.remove('open');
  }

  return { open, close };
}
