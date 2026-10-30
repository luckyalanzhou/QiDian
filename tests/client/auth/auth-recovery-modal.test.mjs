import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createAuthRecoveryModal } from '../../../src/features/auth/auth-recovery-modal.ts';

test('recovery login makes the workspace inert and restores its opener after authentication', () => {
  const dom = new JSDOM(`
    <main id="app"><button id="opener">Account</button><button>Private workspace</button></main>
    <section id="loginGate" aria-labelledby="authTitle"><h1 id="authTitle">Login</h1>
      <input id="authUsername" value="alan"><input id="authPassword"><button id="authSubmit">Login</button>
    </section>
  `);
  const { document } = dom.window;
  const host = document.querySelector('#loginGate');
  const app = document.querySelector('#app');
  const opener = document.querySelector('#opener');
  const password = document.querySelector('#authPassword');
  opener.focus();

  const modal = createAuthRecoveryModal(document, host, app);
  modal.activate();
  assert.equal(host.getAttribute('role'), 'dialog');
  assert.equal(host.getAttribute('aria-modal'), 'true');
  assert.equal(app.hasAttribute('inert'), true);
  assert.equal(host.classList.contains('reauth'), true);

  modal.focus();
  assert.equal(document.activeElement, password, 'prefilled username should send focus to the password field');

  modal.deactivate();
  assert.equal(host.hidden, true);
  assert.equal(host.hasAttribute('role'), false);
  assert.equal(host.hasAttribute('aria-modal'), false);
  assert.equal(host.classList.contains('reauth'), false);
  assert.equal(app.hasAttribute('inert'), false);
  assert.equal(document.activeElement, opener);

  dom.window.close();
});

test('MFA recovery focuses the verification field and preserves preexisting inert state', () => {
  const dom = new JSDOM(`
    <main id="app" inert><button id="opener">Account</button></main>
    <section id="loginGate"><input id="authMfaCode"><button id="authSubmit">Verify</button></section>
  `);
  const { document } = dom.window;
  const host = document.querySelector('#loginGate');
  const app = document.querySelector('#app');
  const code = document.querySelector('#authMfaCode');
  const modal = createAuthRecoveryModal(document, host, app);

  modal.activate();
  modal.focus();
  assert.equal(document.activeElement, code);
  modal.deactivate();
  assert.equal(app.hasAttribute('inert'), true);

  dom.window.close();
});
