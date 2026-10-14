import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const PASSWORD_ITERATIONS = 600_000;
export function parseResetConfirmation(answer) {
  const value = String(answer ?? '').trim().toUpperCase();
  if (value === 'Y') return true;
  if (value === 'N') return false;
  throw new Error('请输入 Y 或 N');
}

function validateNewPassword(password) {
  const value = String(password ?? '');
  if ([...value].length < 8) throw new Error('密码至少需要 8 个字符');
  if ([...value].length > 128) throw new Error('密码最多 128 个字符');
  const categories = [/\p{Lu}/u, /\p{Ll}/u, /\p{N}/u, /[\p{P}\p{S}]/u];
  if (categories.filter(pattern => pattern.test(value)).length < 2) {
    throw new Error('密码至少需要包含大写字母、小写字母、数字、符号中的任意两类');
  }
}

export function resetAccountPassword(db, accountId, password) {
  validateNewPassword(password);
  const salt = randomBytes(16);
  const verifier = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, 'sha256');
  const passwordHash = createHash('sha256').update(verifier).digest('base64');

  db.exec('BEGIN IMMEDIATE');
  try {
    const update = db.prepare(`UPDATE accounts SET password_salt = ?, password_hash = ?, password_iterations = ? WHERE id = ?`)
      .run(salt.toString('base64'), passwordHash, PASSWORD_ITERATIONS, accountId);
    if (Number(update.changes) !== 1) throw new Error('账号不存在，密码未更改');
    const sessionsRevoked = Number(db.prepare('DELETE FROM sessions WHERE account_id = ?').run(accountId).changes);
    db.prepare('DELETE FROM auth_challenges WHERE account_id = ?').run(accountId);
    db.exec('COMMIT');
    return { sessionsRevoked };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function promptLine(label, { hidden = false } = {}) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('此命令需要交互式终端，请使用 docker exec -it qidian node server/reset-password.mjs');
  }
  process.stdout.write(label);
  emitKeypressEvents(input);
  process.stdin.resume();
  process.stdin.setRawMode(true);
  return new Promise((resolveLine, rejectLine) => {
    let value = '';
    const finish = (error) => {
      input.removeListener('keypress', onKeypress);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\n');
      if (error) rejectLine(error);
      else resolveLine(value);
    };
    const onKeypress = (character, key = {}) => {
      if (key.ctrl && ['c', 'd'].includes(key.name)) return finish(new Error('操作已取消'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') {
        if (value) {
          value = [...value].slice(0, -1).join('');
          if (!hidden) process.stdout.write('\b \b');
        }
        return;
      }
      if (character && !key.ctrl && !key.meta) {
        value += character;
        if (!hidden) process.stdout.write(character);
      }
    };
    process.stdin.on('keypress', onKeypress);
  });
}

async function main() {
  if (process.argv.length > 2) throw new Error('此命令不接受密码参数；运行后按提示选择账号并确认');
  const dataDir = resolve(process.env.DATA_DIR || '/data');
  const databasePath = resolve(dataDir, 'qidian.sqlite');
  if (!existsSync(databasePath)) throw new Error(`找不到栖点数据库：${databasePath}。请确认 Docker 数据卷和 DATA_DIR`);

  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA busy_timeout=5000');
  try {
    const identifier = (await promptLine('输入账号：')).trim().toLowerCase();
    if (!identifier) throw new Error('账号不能为空');
    const account = db.prepare('SELECT id, username FROM accounts WHERE username_normalized = ?').get(identifier);
    if (!account) throw new Error('没有找到这个账号，数据库未更改');

    process.stdout.write(`将重置账号 ${account.username} 的密码。\n`);
    let confirmed;
    while (confirmed === undefined) {
      const answer = await promptLine('是否重置密码？输入 Y 确认，N 取消：');
      try {
        confirmed = parseResetConfirmation(answer);
      } catch {
        process.stdout.write('请输入 Y 或 N。\n');
      }
    }
    if (!confirmed) {
      process.stdout.write('已取消，数据库未更改。\n');
      return;
    }

    const password = await promptLine('输入新密码（输入时不显示）：', { hidden: true });
    const confirmation = await promptLine('再次输入新密码：', { hidden: true });
    if (password !== confirmation) throw new Error('两次输入的密码不一致，数据库未更改');
    const { sessionsRevoked } = resetAccountPassword(db, account.id, password);
    process.stdout.write(`密码已重置，已退出 ${sessionsRevoked} 个现有登录会话。\n`);
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main().catch(error => {
    process.stderr.write(`重置失败：${error.message}\n`);
    process.exitCode = 1;
  });
}
