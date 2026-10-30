import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountItemMenuController } from '../../../src/features/navigation/item-menu-controller.ts';

test('open mobile menus reposition inside the visual viewport when the keyboard reduces it', async () => {
  const dom = new JSDOM(`
    <nav class="bottom-nav"></nav>
    <details class="item-menu" open>
      <summary>更多</summary>
      <div class="item-menu-panel"><button>撤销</button><button>重做</button></div>
    </details>
  `, { pretendToBeVisual: true });
  const { document } = dom.window;
  dom.window.innerWidth = 390;
  dom.window.innerHeight = 800;

  const visualViewport = new dom.window.EventTarget();
  visualViewport.height = 800;
  visualViewport.offsetTop = 0;
  Object.defineProperty(dom.window, 'visualViewport', { configurable: true, value: visualViewport });

  const menu = document.querySelector('.item-menu');
  const panel = document.querySelector('.item-menu-panel');
  const bottomNav = document.querySelector('.bottom-nav');
  Object.defineProperty(panel, 'scrollHeight', { configurable: true, value: 180 });
  menu.getBoundingClientRect = () => ({ top: 280, bottom: 320, left: 20, right: 60, width: 40, height: 40 });
  panel.getBoundingClientRect = () => ({ top: 0, bottom: 180, left: 20, right: 300, width: 280, height: 180 });
  bottomNav.getBoundingClientRect = () => ({ top: 710, bottom: 800, left: 0, right: 390, width: 390, height: 90 });

  const menuController = mountItemMenuController(document, dom.window);
  menu.dispatchEvent(new dom.window.Event('toggle'));
  assert.equal(menu.classList.contains('opens-up'), false, 'with the full viewport, the menu opens down into available space');

  visualViewport.height = 440;
  visualViewport.dispatchEvent(new dom.window.Event('resize'));
  await new Promise(resolve => setTimeout(resolve, 30));

  assert.equal(menu.classList.contains('opens-up'), true, 'the keyboard-shrunken viewport causes the menu to open above its trigger');
  assert.ok(Math.abs(Number.parseFloat(panel.style.maxHeight) - 242) < 0.001, 'the panel remains bounded by the visible viewport');

  visualViewport.offsetTop = 50;
  visualViewport.height = 360;
  visualViewport.dispatchEvent(new dom.window.Event('scroll'));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(Math.abs(Number.parseFloat(panel.style.maxHeight) - 198) < 0.001, 'viewport panning and resizing update the available panel height');

  menuController.destroy();
  dom.window.close();
});

test('desktop menu placement continues to use the layout viewport', () => {
  const dom = new JSDOM(`
    <nav class="bottom-nav"></nav>
    <details class="item-menu" open>
      <summary>More</summary>
      <div class="item-menu-panel"><button>Undo</button></div>
    </details>
  `, { pretendToBeVisual: true });
  const { document } = dom.window;
  dom.window.innerWidth = 1280;
  dom.window.innerHeight = 800;
  const visualViewport = new dom.window.EventTarget();
  visualViewport.height = 300;
  visualViewport.offsetTop = 0;
  Object.defineProperty(dom.window, 'visualViewport', { configurable: true, value: visualViewport });

  const menu = document.querySelector('.item-menu');
  const panel = document.querySelector('.item-menu-panel');
  Object.defineProperty(panel, 'scrollHeight', { configurable: true, value: 180 });
  menu.getBoundingClientRect = () => ({ top: 280, bottom: 320, left: 20, right: 60, width: 40, height: 40 });
  panel.getBoundingClientRect = () => ({ top: 0, bottom: 180, left: 20, right: 300, width: 280, height: 180 });

  const menuController = mountItemMenuController(document, dom.window);
  menu.dispatchEvent(new dom.window.Event('toggle'));

  assert.equal(menu.classList.contains('opens-up'), false, 'desktop placement ignores the mobile visual viewport and bottom navigation');
  assert.equal(panel.style.maxHeight, '464px');

  menuController.destroy();
  dom.window.close();
});
