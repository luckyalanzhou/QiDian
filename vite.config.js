import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';

const projectVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

const pwaServiceWorker = {
  name: 'qidian-pwa-service-worker',
  apply: 'build',
  generateBundle() {
    const source = readFileSync(new URL('./src/pwa/service-worker.js', import.meta.url), 'utf8')
      .replaceAll('__QIDIAN_PWA_VERSION__', projectVersion);
    this.emitFile({ type: 'asset', fileName: 'sw.js', source });
  }
};

export default defineConfig({
  plugins: [vue(), pwaServiceWorker]
});
