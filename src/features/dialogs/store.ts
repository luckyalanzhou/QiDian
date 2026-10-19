import { defineStore } from 'pinia';

export type ActionDialogMode = 'confirm' | 'prompt';

export type ActionDialogOptions = {
  mode?: ActionDialogMode;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  inputLabel?: string;
  inputValue?: string;
  maxLength?: number;
};

export const useActionDialogStore = defineStore('action-dialog', {
  state: () => ({
    visible: false,
    mode: 'confirm' as ActionDialogMode,
    title: '确认操作',
    message: '',
    confirmText: '确认',
    cancelText: '取消',
    danger: false,
    inputLabel: '',
    inputValue: '',
    maxLength: 2048
  }),
  actions: {
    show(options: ActionDialogOptions = {}) {
      this.mode = options.mode || 'confirm';
      this.title = options.title || '确认操作';
      this.message = options.message || '';
      this.confirmText = options.confirmText || '确认';
      this.cancelText = options.cancelText || '取消';
      this.danger = !!options.danger;
      this.inputLabel = options.inputLabel || '';
      this.inputValue = String(options.inputValue ?? '');
      this.maxLength = options.maxLength || 2048;
      this.visible = true;
    },
    setInputValue(value: string) {
      this.inputValue = value;
    },
    hide() {
      this.visible = false;
    }
  }
});
