/**
 * Dialogs in this app are opened from dropdown-menu items (the menu closes and unmounts the item that
 * "owned" the dialog), so Radix has no trigger to hand focus back to and focus falls to <body>.
 * We remember the last menu trigger and return focus there when such a dialog closes.
 */
let lastTrigger: HTMLElement | null = null;

export const rememberTrigger = (el: HTMLElement | null) => { lastTrigger = el; };

export function restoreFocus(e: Event) {
  if (e.defaultPrevented) return;
  if (lastTrigger?.isConnected) {
    e.preventDefault();
    lastTrigger.focus();
  }
}
