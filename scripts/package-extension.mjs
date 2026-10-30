import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const sourceDirectory = resolve(repositoryRoot, 'browser-extension/chrome');
const includedFiles = ['manifest.json', 'popup.html', 'popup.js'];

function validateVersion(version) {
  const parts = String(version).split('.');
  if (parts.length !== 3 || parts.some(part => !/^\d+$/.test(part) || Number(part) > 65535)) {
    throw new Error(`Chrome 扩展版本必须是三个不超过 65535 的数字：${version}`);
  }
}

export async function packageExtension({ version, outputDirectory = resolve(repositoryRoot, 'artifacts/extension') } = {}) {
  const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'));
  const releaseVersion = version || packageJson.version;
  validateVersion(releaseVersion);
  const entries = {};
  for (const name of includedFiles) {
    let contents = await readFile(resolve(sourceDirectory, name), 'utf8');
    if (name === 'manifest.json') contents = contents.replaceAll('@@VERSION@@', releaseVersion);
    entries[name] = strToU8(contents);
  }
  const output = resolve(outputDirectory, `qidian-chrome-${releaseVersion}.zip`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, zipSync(entries, { level: 8 }));
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  packageExtension().then(path => process.stdout.write(`${path}\n`)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
