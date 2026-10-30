import { nextTick } from 'vue';
import { pinia } from '../../stores/pinia.ts';
import { useActionDialogStore, type ActionDialogMode, type ActionDialogOptions } from './store.ts';
import { firstRestorableFocusTarget } from './dialog-focus-return.ts';

type ActionDialogResult = boolean | string | null;
type PendingAction = {
  mode: ActionDialogMode;
  resolve: (value: ActionDialogResult) => void;
  returnFocus: HTMLElement | null;
};

export function createActionDialogService(
  store: ReturnType<typeof useActionDialogStore>,
  getDocument: () => Document | undefined = () => globalThis.document
) {
  let pending: PendingAction | null = null;

  function open(options: ActionDialogOptions = {}): Promise<ActionDialogResult> {
    if (pending) return Promise.resolve(options.mode === 'prompt' ? null : false);

    return new Promise(resolve => {
      const document = getDocument();
      const active = document?.activeElement;
      const elementConstructor = document?.defaultView?.HTMLElement;
      const activeElement = elementConstructor && active instanceof elementConstructor ? active as HTMLElement : null;
      const menuTrigger = activeElement?.closest('details.item-menu')?.querySelector<HTMLElement>('summary');
      pending = {
        mode: options.mode || 'confirm',
        resolve,
        returnFocus: menuTrigger ?? activeElement
      };
      store.show(options);
    });
  }

  function close(accepted: boolean) {
    if (!pending) return;
    const current = pending;
    pending = null;
    const result = current.mode === 'prompt'
      ? accepted ? store.inputValue : null
      : !!accepted;
    store.hide();
    void nextTick(() => {
      const document = getDocument();
      if (!document) return;
      document.defaultView?.setTimeout(() => {
        const fallbackTargets = ['#searchTop', '#mobileSearch', '#menuBtn', '#accountButton']
          .map(selector => document.querySelector<HTMLElement>(selector))
          .filter((target): target is HTMLElement => target instanceof document.defaultView!.HTMLElement);
        firstRestorableFocusTarget([
          ...(current.returnFocus ? [current.returnFocus] : []),
          ...fallbackTargets
        ])?.focus({ preventScroll: true });
      }, 0);
    });
    current.resolve(result);
  }

  return { open, close };
}

const service = createActionDialogService(useActionDialogStore(pinia));
export const openActionDialog = service.open;
export const closeActionDialog = service.close;
