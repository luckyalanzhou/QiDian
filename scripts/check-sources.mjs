import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { extname, join } from 'node:path';

const roots = ['src', 'server', 'scripts', 'tests'];
const files = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes:true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (['.js','.mjs'].includes(extname(entry.name))) files.push(path);
  }
}

for (const root of roots) await collect(root);
files.sort((left,right)=>left.localeCompare(right,'en'));

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio:'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`Checked ${files.length} JavaScript source files.`);
