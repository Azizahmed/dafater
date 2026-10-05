import { LayoutType, TextAlign } from '@blocksuite/affine/model';

/**
 * Edgeless defaults for a right-to-left interface, used for settings the user
 * has not chosen: text starts on the right and mind maps grow leftwards, the
 * reading direction. Values the user picked are never overridden.
 */
const RTL_DEFAULTS: Record<string, Record<string, unknown>> = {
  text: { textAlign: TextAlign.Right },
  'affine:edgeless-text': { textAlign: TextAlign.Right },
  mindmap: { layoutType: LayoutType.LEFT },
};

function isRtlInterface() {
  return (
    typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
  );
}

/**
 * The default of an editor setting for the current interface direction:
 * `fallback` (the schema default), adjusted for right-to-left interfaces.
 */
export function directionalDefault<T>(key: string, fallback: T): T {
  const overrides = RTL_DEFAULTS[key];
  if (!overrides || !isRtlInterface()) return fallback;
  return { ...fallback, ...overrides };
}
