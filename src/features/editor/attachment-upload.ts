type UploadedAttachment = {
  url: string;
  name: string;
  size: number;
};

type AttachmentUploadDependencies = {
  upload: (file: File) => Promise<UploadedAttachment>;
  insertHTML: (html: string) => void;
  escapeHTML: (value: string) => string;
  notify: (message: string) => void;
};

export function createAttachmentUploadFlow(dependencies: AttachmentUploadDependencies) {
  async function insertFiles(files: Iterable<File>) {
    for (const file of files) {
      try {
        const attachment = await dependencies.upload(file);
        if (!attachment || typeof attachment.url !== 'string' || !attachment.url.trim()) {
          throw new Error('附件上传响应无效');
        }

        const url = attachment.url;
        const href = `${url}${url.includes('?') ? '&' : '?'}download=1`;
        const name = attachment.name || file.name;
        const size = Number.isFinite(attachment.size) ? attachment.size : file.size;
        dependencies.insertHTML(
          `<p>📎 <a href="${dependencies.escapeHTML(href)}">${dependencies.escapeHTML(name)}</a> (${(size / 1024).toFixed(1)} KB)</p>`
        );
      } catch (error) {
        dependencies.notify((error as Error)?.message || '附件上传失败');
      }
    }
  }

  return { insertFiles };
}
