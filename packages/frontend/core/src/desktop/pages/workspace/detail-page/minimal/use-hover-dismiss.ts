import { type RefObject, useEffect } from 'react';

// menus, sub menus, popovers and tooltips are portaled into these wrappers
const POPPER_SELECTOR = '[data-radix-popper-content-wrapper]';

const isTextInput = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement &&
  (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

/**
 * Keep the dropdown open while it is being worked with:
 * - a text field inside a dropdown has focus (e.g. renaming the doc)
 * - a modal dialog opened from the dropdown is showing
 */
const shouldHold = () => {
  const active = document.activeElement;
  if (isTextInput(active) && active.closest(POPPER_SELECTOR)) {
    return true;
  }
  return Array.from(
    document.querySelectorAll('[role="dialog"], [role="alertdialog"]')
  ).some(el => !el.closest(POPPER_SELECTOR));
};

/**
 * Closes a top bar dropdown once the pointer leaves both its trigger and
 * every popper it opened, so the dropdown "goes away" when it is left.
 */
export const useHoverDismiss = ({
  open,
  onDismiss,
  anchorRef,
  delay = 300,
}: {
  open: boolean;
  onDismiss: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  delay?: number;
}) => {
  useEffect(() => {
    if (!open) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const isInside = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      if (anchorRef.current?.contains(target)) return true;
      return !!target.closest(POPPER_SELECTOR);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (isInside(e.target)) {
        clear();
        return;
      }
      if (timer !== null || shouldHold()) return;
      timer = setTimeout(() => {
        timer = null;
        if (!shouldHold()) onDismiss();
      }, delay);
    };
    document.addEventListener('pointermove', onPointerMove, true);
    return () => {
      clear();
      document.removeEventListener('pointermove', onPointerMove, true);
    };
  }, [open, onDismiss, anchorRef, delay]);
};
