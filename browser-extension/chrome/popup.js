const STORAGE_KEY = 'qidianExtensionCredential';
const pairingView = document.querySelector('#pairingView');
const connectedView = document.querySelector('#connectedView');
const message = document.querySelector('#message');
let credential = null;

function isLoopback(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1') return true;
  const octets = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  return !!octets && octets.slice(1).every(value => Number(value) <= 255);
}

function parseInstance(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw Error('请输入有效的栖点地址'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw Error('请填写实例根地址，不要包含路径、账号或查询参数');
  }
  if (url.protocol !== 'https:' && !isLoopback(url.hostname)) throw Error('远程实例必须使用 HTTPS；HTTP 仅支持本机回环地址');
  return url;
}

function permissionPattern(origin) {
  return `${origin}/*`;
}

function setMessage(text) {
  message.textContent = text;
}

function render() {
  pairingView.hidden = !!credential;
  connectedView.hidden = !credential;
  if (credential) document.querySelector('#instanceLabel').textContent = new URL(credential.origin).host;
}

async function responseJson(response) {
  let body;
  try { body = await response.json(); } catch { throw Error('服务器返回内容无法读取'); }
  if (!response.ok) throw Error(typeof body.error === 'string' ? body.error : '请求失败');
  return body;
}

async function pair(event) {
  event.preventDefault();
  setMessage('');
  let instance;
  try { instance = parseInstance(document.querySelector('#instanceUrl').value); }
  catch (error) { setMessage(error.message); return; }
  const permission = permissionPattern(instance.origin);
  let permissionGranted = false, pairingIssued = false;
  try {
    if (!await chrome.permissions.request({ origins: [permission] })) {
      setMessage('未授予访问此栖点实例的权限');
      return;
    }
    permissionGranted = true;
    const body = await responseJson(await fetch(`${instance.origin}/api/extensions/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: document.querySelector('#pairingCode').value.trim() }),
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store'
    }));
    pairingIssued = true;
    const pairedCredential = { origin: instance.origin, token: body.token, name: body.name, expires: body.expires };
    await chrome.storage.local.set({ [STORAGE_KEY]: pairedCredential });
    credential = pairedCredential;
    permissionGranted = false;
    render();
    setMessage('配对完成，可以保存当前网页');
  } catch (error) {
    let permissionWarning = '';
    if (permissionGranted) {
      try {
        if (!await chrome.permissions.remove({ origins: [permission] })) permissionWarning = '；未能自动移除站点权限，请在 Chrome 扩展设置中检查';
      } catch {
        permissionWarning = '；未能自动移除站点权限，请在 Chrome 扩展设置中检查';
      }
    }
    if (pairingIssued) {
      setMessage(`服务端已完成配对，但本机未能保存令牌。请在栖点个人资料中撤销该扩展后重试${permissionWarning}`);
    } else {
      setMessage(`${error.message || '无法连接栖点实例'}${permissionWarning}`);
    }
  }
}

async function saveCurrent() {
  setMessage('');
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.url || !['http:', 'https:'].includes(new URL(tab.url).protocol)) throw Error('当前页面不是可保存的网页');
    const body = await responseJson(await fetch(`${credential.origin}/api/extensions/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credential.token}`
      },
      body: JSON.stringify({ url: tab.url, title: tab.title || '' }),
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store'
    }));
    setMessage(body.status === 'duplicate' ? '这个网址已经在书签中' : '已保存到栖点');
  } catch (error) {
    setMessage(error.message || '保存失败；若令牌已撤销，请重新配对');
  }
}

async function disconnect() {
  const previous = credential;
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch {
    setMessage('解除本机连接失败，当前仍保持连接');
    return;
  }
  credential = null;
  let permissionWarning = '';
  if (previous?.origin) {
    const permission = { origins: [permissionPattern(previous.origin)] };
    try {
      if (!await chrome.permissions.remove(permission) && await chrome.permissions.contains(permission)) {
        permissionWarning = '；站点权限仍保留，请在 Chrome 扩展设置中移除';
      }
    } catch {
      try {
        if (await chrome.permissions.contains(permission)) permissionWarning = '；站点权限仍保留，请在 Chrome 扩展设置中移除';
      } catch {
        permissionWarning = '；无法确认站点权限是否已移除，请在 Chrome 扩展设置中检查';
      }
    }
  }
  render();
  setMessage(`已解除本机连接；服务器令牌仍有效，可在栖点个人资料中撤销${permissionWarning}`);
}

document.querySelector('#pairingForm').addEventListener('submit', pair);
document.querySelector('#saveCurrent').addEventListener('click', saveCurrent);
document.querySelector('#disconnect').addEventListener('click', disconnect);
chrome.storage.local.get(STORAGE_KEY).then(values => {
  credential = values[STORAGE_KEY] || null;
  render();
}).catch(() => setMessage('无法读取本机扩展设置'));
