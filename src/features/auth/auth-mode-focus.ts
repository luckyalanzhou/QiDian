import { nextTick, watch } from 'vue';

/** Keep keyboard focus at the start when the login form changes mode. */
export function focusUsernameWhenAuthModeChanges(
  getMode: () => string,
  getUsernameInput: () => HTMLInputElement | null
) {
  return watch(getMode, () => {
    void nextTick(() => getUsernameInput()?.focus({ preventScroll: true }));
  });
}
