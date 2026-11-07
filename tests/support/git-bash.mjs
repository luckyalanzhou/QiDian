import { execFileSync } from 'node:child_process';
import { delimiter, dirname, join, resolve } from 'node:path';

function locateBash() {
  if (process.platform !== 'win32') return 'bash';

  const gitPath = execFileSync('where.exe', ['git.exe'], { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/)[0];
  const gitRoot = resolve(dirname(gitPath), '..');
  const bashPath = join(gitRoot, 'bin', 'bash.exe');

  process.env.PATH = [join(gitRoot, 'usr', 'bin'), join(gitRoot, 'bin'), process.env.PATH]
    .filter(Boolean)
    .join(delimiter);

  return bashPath;
}

export const bash = locateBash();
