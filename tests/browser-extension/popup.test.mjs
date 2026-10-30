import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const extensionDirectory = new URL('../../browser-extension/chrome/', import.meta.url);
const html = await readFile(new URL('popup.html', extensionDirectory), 'utf8');
const script = await readFile(new URL('popup.js', extensionDirectory), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function openPopup({ storedCredential = null, responses = [], fetchError = null, storageError = null, storageRemoveError = null, permissionsRemoveError = null, permissionPresent = false, tab = { url:'https://docs.example/guide', title:'Guide' }, permissionGranted = true } = {}) {
  const dom = new JSDOM(html, { url:'https://extension.invalid/', runScripts:'outside-only' });
  const calls = { permissions:[], requests:[], removed:[], contains:[], tabs:0 };
  const storage = storedCredential ? { qidianExtensionCredential:storedCredential } : {};
  dom.window.chrome = {
    permissions: {
      request: async value => { calls.permissions.push(value); return permissionGranted; },
      remove: async value => { calls.removed.push(value); if (permissionsRemoveError) throw permissionsRemoveError; return !permissionPresent; },
      contains: async value => { calls.contains.push(value); return permissionPresent; }
    },
    storage: { local: {
      get: async key => ({ [key]:storage[key] }),
      set: async value => { if (storageError) throw storageError; Object.assign(storage, value); },
      remove: async key => { if (storageRemoveError) throw storageRemoveError; delete storage[key]; calls.removed.push(key); }
    } },
    tabs: { query: async () => { calls.tabs += 1; return [tab]; } }
  };
  dom.window.fetch = async (url, options) => {
    calls.requests.push({ url:String(url), options });
    if (fetchError) throw fetchError;
    const body = responses.shift() || { status:'created', id:'bookmark-1', revision:2 };
    return { ok:body.ok !== false, json:async () => body.body || body };
  };
  dom.window.eval(script);
  return { dom, calls, storage };
}

test('pairing requests access only to the chosen instance and explicit save submits the active page', async t => {
  const credential = { origin:'https://qidian.example', token:'qidian_ext_secret', name:'Chrome', expires:Date.now()+60_000 };
  const { dom, calls, storage } = openPopup({ responses:[credential, { status:'created', id:'bookmark-1', revision:2 }] });
  t.after(() => dom.window.close());
  const document = dom.window.document;
  document.querySelector('#instanceUrl').value = 'https://qidian.example/';
  document.querySelector('#pairingCode').value = 'qidian_pair_once';
  document.querySelector('#pairingForm').dispatchEvent(new dom.window.Event('submit', { bubbles:true, cancelable:true }));
  await tick(); await tick();
  assert.equal(JSON.stringify(calls.permissions), JSON.stringify([{ origins:['https://qidian.example/*'] }]));
  assert.equal(calls.requests[0].url, 'https://qidian.example/api/extensions/pair');
  assert.equal(calls.requests[0].options.credentials, 'omit');
  assert.equal(storage.qidianExtensionCredential.token, 'qidian_ext_secret');
  assert.equal(document.querySelector('#connectedView').hidden, false);

  document.querySelector('#saveCurrent').click();
  await tick();
  const saveRequest = calls.requests[1];
  assert.equal(saveRequest.url, 'https://qidian.example/api/extensions/bookmarks');
  assert.equal(saveRequest.options.headers.Authorization, 'Bearer qidian_ext_secret');
  assert.deepEqual(JSON.parse(saveRequest.options.body), { url:'https://docs.example/guide', title:'Guide' });
  assert.equal(document.querySelector('#message').textContent, '已保存到栖点');
});

test('opening an already paired popup never writes; duplicate saves have an explicit result', async t => {
  const { dom, calls } = openPopup({
    storedCredential:{ origin:'https://qidian.example', token:'qidian_ext_saved', name:'Chrome', expires:Date.now()+60_000 },
    responses:[{ status:'duplicate', id:'bookmark-1', revision:2 }]
  });
  t.after(() => dom.window.close());
  await tick();
  assert.equal(calls.requests.length, 0, 'opening the popup must not write a bookmark');
  assert.equal(calls.tabs, 0);
  assert.equal(dom.window.document.querySelector('#connectedView').hidden, false);
  dom.window.document.querySelector('#saveCurrent').click();
  await tick();
  assert.equal(calls.tabs, 1);
  assert.equal(calls.requests.length, 1);
  assert.equal(dom.window.document.querySelector('#message').textContent, '这个网址已经在书签中');
});

test('remote HTTP pairing is rejected before host access is requested', async t => {
  const { dom, calls } = openPopup();
  t.after(() => dom.window.close());
  const document = dom.window.document;
  document.querySelector('#instanceUrl').value = 'http://qidian.example:9908';
  document.querySelector('#pairingCode').value = 'qidian_pair_once';
  document.querySelector('#pairingForm').dispatchEvent(new dom.window.Event('submit', { bubbles:true, cancelable:true }));
  await tick();
  assert.deepEqual(calls.permissions, []);
  assert.deepEqual(calls.requests, []);
  assert.match(document.querySelector('#message').textContent, /必须使用 HTTPS/);
});

test('failed pairing releases the optional host permission so it can be requested again', async t => {
  for (const failure of [
    { responses:[{ ok:false, body:{ error:'配对码无效或已过期，请重新生成' } }], expected:/配对码无效/ },
    { fetchError:Error('连接失败'), expected:/连接失败/ }
  ]) {
    const { dom, calls, storage } = openPopup(failure);
    t.after(() => dom.window.close());
    const document = dom.window.document;
    document.querySelector('#instanceUrl').value = 'https://qidian.example/';
    document.querySelector('#pairingCode').value = 'qidian_pair_expired';
    document.querySelector('#pairingForm').dispatchEvent(new dom.window.Event('submit', { bubbles:true, cancelable:true }));
    await tick(); await tick();

    assert.equal(JSON.stringify(calls.removed), JSON.stringify([{ origins:['https://qidian.example/*'] }]));
    assert.equal(storage.qidianExtensionCredential, undefined);
    assert.equal(document.querySelector('#pairingView').hidden, false);
    assert.match(document.querySelector('#message').textContent, failure.expected);
  }
});

test('local credential storage failure warns that the server token must be revoked', async t => {
  const issued = { origin:'https://qidian.example', token:'qidian_ext_issued', name:'Chrome', expires:Date.now()+60_000 };
  const { dom, calls, storage } = openPopup({ responses:[issued], storageError:Error('本机存储不可用') });
  t.after(() => dom.window.close());
  const document = dom.window.document;
  document.querySelector('#instanceUrl').value = 'https://qidian.example/';
  document.querySelector('#pairingCode').value = 'qidian_pair_once';
  document.querySelector('#pairingForm').dispatchEvent(new dom.window.Event('submit', { bubbles:true, cancelable:true }));
  await tick(); await tick();

  assert.equal(JSON.stringify(calls.removed), JSON.stringify([{ origins:['https://qidian.example/*'] }]));
  assert.equal(storage.qidianExtensionCredential, undefined);
  assert.equal(document.querySelector('#connectedView').hidden, true);
  assert.match(document.querySelector('#message').textContent, /服务端已完成.*撤销.*重试/);
});

test('failed disconnect keeps the saved credential and connected actions usable', async t => {
  const credential = { origin:'https://qidian.example', token:'qidian_ext_saved', name:'Chrome', expires:Date.now()+60_000 };
  const { dom, calls, storage } = openPopup({ storedCredential:credential, storageRemoveError:Error('本机存储不可用') });
  t.after(() => dom.window.close());
  await tick();
  const document = dom.window.document;

  document.querySelector('#disconnect').click();
  await tick(); await tick();

  assert.equal(storage.qidianExtensionCredential.token, credential.token);
  assert.equal(document.querySelector('#connectedView').hidden, false);
  assert.match(document.querySelector('#message').textContent, /解除本机连接失败.*仍保持连接/);

  document.querySelector('#saveCurrent').click();
  await tick();
  assert.equal(calls.requests[0].options.headers.Authorization, `Bearer ${credential.token}`);
});

test('disconnect warns when the optional instance permission remains granted', async t => {
  const credential = { origin:'https://qidian.example', token:'qidian_ext_saved', name:'Chrome', expires:Date.now()+60_000 };
  const { dom, calls, storage } = openPopup({
    storedCredential:credential,
    permissionsRemoveError:Error('权限暂时不可用'),
    permissionPresent:true
  });
  t.after(() => dom.window.close());
  await tick();

  dom.window.document.querySelector('#disconnect').click();
  await tick(); await tick();

  assert.equal(storage.qidianExtensionCredential, undefined, 'disconnect still clears the local token');
  assert.equal(dom.window.document.querySelector('#connectedView').hidden, true);
  assert.equal(JSON.stringify(calls.contains), JSON.stringify([{ origins:['https://qidian.example/*'] }]));
  assert.match(dom.window.document.querySelector('#message').textContent, /站点权限仍保留.*Chrome 扩展设置中移除/);
});
