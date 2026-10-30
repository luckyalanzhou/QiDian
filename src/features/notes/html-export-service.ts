import type { VaultNote } from '../../../shared/api-contracts.js';

type HtmlExportPlatform = Pick<typeof globalThis, 'Blob' | 'DOMParser' | 'FileReader' | 'document'>;

type HtmlExportDependencies = {
  getAssetResponse: (id: string, download: boolean) => Promise<Response>;
  download: (blob: Blob, name: string) => void;
  platform?: HtmlExportPlatform;
};

const assetPathPattern = /^\/api\/assets\/([a-f0-9-]{36})(\?download=1)?$/;

export function createHtmlExportService(dependencies: HtmlExportDependencies) {
  const platform = dependencies.platform ?? globalThis;

  async function readAsDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new platform.FileReader();
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('附件转换为 Data URL 失败'));
      reader.onerror = () => reject(reader.error ?? new Error('读取附件失败'));
      reader.readAsDataURL(blob);
    });
  }

  async function exportHTML(note: VaultNote, sanitizedHTML: string): Promise<void> {
    const doc = new platform.DOMParser().parseFromString(sanitizedHTML, 'text/html');

    for (const element of doc.querySelectorAll('img[src], a[href]')) {
      const attribute = element.tagName === 'IMG' ? 'src' : 'href';
      const raw = element.getAttribute(attribute) ?? '';
      const assetPath = assetPathPattern.exec(raw);
      if (!assetPath) continue;

      const response = await dependencies.getAssetResponse(assetPath[1], Boolean(assetPath[2]));
      const asset = await response.blob();
      const embeddedBlob = element.tagName === 'IMG'
        ? asset
        : new platform.Blob([asset], { type: 'application/octet-stream' });
      element.setAttribute(attribute, await readAsDataUrl(embeddedBlob));

      if (element.tagName === 'A') {
        element.setAttribute('download', element.textContent.trim() || '附件');
        element.removeAttribute('target');
      }
    }

    const title = platform.document.createElement('h1');
    title.textContent = note.title;
    doc.body.prepend(title);
    doc.title = note.title;

    const charset = doc.createElement('meta');
    charset.setAttribute('charset', 'utf-8');
    doc.head.prepend(charset);

    const style = doc.createElement('style');
    style.textContent = 'body{max-width:900px;margin:40px auto;padding:0 24px;font:16px/1.8 system-ui;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}pre{overflow:auto;background:#f1f3f8;padding:16px}blockquote,.callout{background:#eef0ff;padding:12px}';
    doc.head.append(style);

    dependencies.download(
      new platform.Blob(['<!doctype html>' + doc.documentElement.outerHTML], { type: 'text/html' }),
      `${note.title}.html`
    );
  }

  return { exportHTML };
}
