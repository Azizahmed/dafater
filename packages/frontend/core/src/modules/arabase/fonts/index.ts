/**
 * The product font, chosen by the user (Settings → Appearance) and applied
 * through the theme's font variables, so the whole interface and the
 * documents' "Sans" / "Serif" styles follow it. The choice is stored locally
 * and applied synchronously at startup: no frame is painted with another font.
 */
import './fonts.css';

export type FontChoice = 'thmanyah' | 'noto' | 'system';

export const DEFAULT_FONT: FontChoice = 'thmanyah';

const STORAGE_KEY = 'dafater:font';

/** Latin theme fonts (`@toeverything/theme`) followed by the Arabic stack. */
const THEME_SANS = `"Inter", "Source Sans 3", Poppins, var(--arabase-arabic-font)`;
const THEME_SERIF = `"Source Serif 4", "Noto Serif", var(--arabase-arabic-serif-font), serif, "Cambria"`;
const SYSTEM = `"Helvetica Neue", Tahoma, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`;

interface FontStacks {
  sans: string;
  serif: string;
}

export const FONT_STACKS: Record<FontChoice, FontStacks> = {
  // Thmanyah covers Latin and Arabic: one typeface for the whole product.
  thmanyah: {
    sans: `"Thmanyah Sans", ${THEME_SANS}`,
    serif: `"Thmanyah Serif", ${THEME_SERIF}`,
  },
  // Inter for Latin, Noto for Arabic (bundled fallback when not installed).
  noto: {
    sans: `"Inter", "Noto Sans Arabic", "Arabase Noto Sans Arabic", ${THEME_SANS}`,
    serif: `"Source Serif 4", "Noto Naskh Arabic", ${THEME_SERIF}`,
  },
  // Inter for Latin, the operating system's Arabic font.
  system: { sans: THEME_SANS, serif: THEME_SERIF },
};

export const FONT_CHOICES = Object.keys(FONT_STACKS) as FontChoice[];

function isFontChoice(value: unknown): value is FontChoice {
  return typeof value === 'string' && value in FONT_STACKS;
}

export function fontCss(choice: FontChoice): string {
  const { sans, serif } = FONT_STACKS[choice];
  const vars = (system: string) =>
    `--affine-font-family:${sans}, ${system};--affine-font-sans-family:${sans}, ${system};--affine-font-serif-family:${serif}, ${system};`;
  return (
    `:root:root{${vars(`apple-system, BlinkMacSystemFont, ${SYSTEM}`)}}` +
    `@media print{:root:root{${vars(SYSTEM)}}}`
  );
}

let current: FontChoice = DEFAULT_FONT;
const listeners = new Set<() => void>();

function readStoredFont(): FontChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isFontChoice(stored) ? stored : DEFAULT_FONT;
  } catch {
    return DEFAULT_FONT;
  }
}

function applyFont(choice: FontChoice) {
  if (typeof document === 'undefined') return;
  const id = 'dafater-font';
  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.append(style);
  }
  const css = fontCss(choice);
  if (style.textContent !== css) style.textContent = css;
}

/** Applies the stored font. Called once at startup, before the first render. */
export function initFont() {
  current = readStoredFont();
  applyFont(current);
}

export function getFont(): FontChoice {
  return current;
}

export function setFont(choice: FontChoice) {
  if (!isFontChoice(choice) || choice === current) return;
  current = choice;
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage disabled: the choice lasts for this session.
  }
  applyFont(choice);
  listeners.forEach(listener => listener());
}

/** For `useSyncExternalStore`. */
export function subscribeFont(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
