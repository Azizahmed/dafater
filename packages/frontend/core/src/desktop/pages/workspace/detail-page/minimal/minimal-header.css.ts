import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, keyframes, style } from '@vanilla-extract/css';

// Visual language: floating cards with a generous radius, a hairline edge and
// a soft, wide shadow that grow out of the control that opened them; rounded
// rows, pill-shaped fields and controls, quiet gray meta text.
const CARD_RADIUS = 18;
const ROW_RADIUS = 10;
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const cardShadow =
  '0 0 0 0.5px rgba(0, 0, 0, 0.06), 0 2px 6px rgba(0, 0, 0, 0.04), 0 16px 40px rgba(0, 0, 0, 0.08)';

// workspace · title · settings
export const header = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  height: '100%',
});

export const left = style({
  display: 'flex',
  justifyContent: 'flex-start',
  minWidth: 0,
});

export const center = style({
  display: 'flex',
  justifyContent: 'center',
  minWidth: 0,
  maxWidth: 'min(480px, 50vw)',
});

export const right = style({
  display: 'flex',
  justifyContent: 'flex-end',
  minWidth: 0,
});

export const topBarButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  maxWidth: '100%',
  height: 30,
  padding: '0 12px',
  border: 'none',
  borderRadius: 999,
  background: 'transparent',
  color: cssVarV2('text/primary'),
  fontFamily: cssVar('fontSansFamily'),
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: 'background 0.2s ease-in-out, opacity 0.2s ease-in-out',
  selectors: {
    '&:hover, &[data-open="true"]': {
      background: cssVarV2('layer/background/hoverOverlay'),
    },
  },
});

export const buttonLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const settingsButton = style({
  color: cssVarV2('text/secondary'),
  selectors: {
    '&:hover, &[data-open="true"]': {
      color: cssVarV2('text/primary'),
    },
  },
});

// the title only shows once the page title is scrolled out of view
export const titleButton = style({
  transform: 'translateY(4px)',
  opacity: 0,
  pointerEvents: 'none',
  transition:
    'opacity 0.2s ease-in-out, transform 0.2s ease-in-out, background 0.2s ease-in-out',
  selectors: {
    '&[data-visible="true"], &[data-open="true"]': {
      transform: 'none',
      opacity: 1,
      pointerEvents: 'auto',
    },
  },
});

export const plainTitle = style([
  topBarButton,
  {
    cursor: 'default',
    selectors: {
      '&:hover': {
        background: 'transparent',
      },
    },
  },
]);

const cardIn = keyframes({
  from: { opacity: 0, transform: 'scale(0.94) translateY(-6px)' },
  to: { opacity: 1, transform: 'none' },
});

/**
 * Applied to every dropdown of the top bar (and their sub menus): the card
 * grows from the trigger, like the reference design.
 */
export const card = style({
  transformOrigin:
    'var(--radix-dropdown-menu-content-transform-origin, var(--radix-popover-content-transform-origin))',
  selectors: {
    // radix contents always carry `data-state` and a `role`: the extra
    // attributes win over the default menu / popover look and animation
    '&[data-state][role]': {
      borderRadius: CARD_RADIUS,
      padding: 6,
      border: 'none',
      boxShadow: cardShadow,
      background: cssVarV2('layer/background/overlayPanel'),
    },
    '&[data-state="open"][role]': {
      animation: `${cardIn} 0.28s ${EASE_OUT}`,
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      selectors: {
        '&[data-state="open"][role]': {
          animation: 'none',
        },
      },
    },
  },
});

globalStyle(`${card} [role="menuitem"]`, {
  borderRadius: ROW_RADIUS,
  padding: '6px 8px',
  transition: 'background 0.15s ease-in-out',
});

// a card's title row: "Settings ×" / "Workspace"
export const cardHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '4px 4px 6px 10px',
  color: cssVarV2('text/primary'),
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
});

export const cardClose = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  border: 'none',
  borderRadius: 999,
  background: 'transparent',
  color: cssVarV2('icon/secondary'),
  fontSize: 16,
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      background: cssVarV2('layer/background/hoverOverlay'),
      color: cssVarV2('icon/primary'),
    },
  },
});

// keyboard hint chip at the end of a row, e.g. ⌥S
export const keyHint = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 20,
  height: 20,
  padding: '0 6px',
  borderRadius: 6,
  border: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
  color: cssVarV2('text/tertiary'),
  fontSize: 11,
  lineHeight: 1,
});

// workspace dropdown: the app sidebar navigation, dropped down from the bar
export const workspacePanel = style({
  display: 'flex',
  flexDirection: 'column',
  width: 300,
  height: 'min(640px, calc(100vh - 80px))',
  padding: '4px 0',
  overflow: 'hidden',
});

export const workspacePanelContent = style({
  selectors: {
    [`${card}&[data-state][role]`]: {
      padding: 0,
      overflow: 'hidden',
    },
  },
});

export const docMenu = style({
  width: 300,
  maxWidth: 'calc(var(--radix-dropdown-menu-content-available-width) - 8px)',
});

export const renameInput = style({
  width: '100%',
  height: 38,
  margin: '2px 0 6px',
  padding: '0 14px',
  border: '1px solid transparent',
  borderRadius: 14,
  outline: 'none',
  background: cssVarV2('layer/background/hoverOverlay'),
  color: cssVarV2('text/primary'),
  fontSize: cssVar('fontBase'),
  fontWeight: 500,
  transition: 'border-color 0.2s ease-in-out, background 0.2s ease-in-out',
  selectors: {
    '&:focus': {
      borderColor: cssVarV2('layer/insideBorder/border'),
      background: 'transparent',
    },
    '&::placeholder': {
      color: cssVarV2('text/placeholder'),
    },
    '&:disabled': {
      color: cssVarV2('text/secondary'),
    },
  },
});

// pill segmented control with a sliding thumb (page / edgeless)
export const segmented = style({
  position: 'relative',
  display: 'grid',
  gridAutoColumns: '1fr',
  gridAutoFlow: 'column',
  margin: '2px 2px 6px',
  padding: 3,
  borderRadius: 999,
  background: cssVarV2('layer/background/hoverOverlay'),
});

export const segmentedThumb = style({
  position: 'absolute',
  top: 3,
  bottom: 3,
  left: 3,
  borderRadius: 999,
  background: cssVarV2('layer/background/overlayPanel'),
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.06)',
  transition: `transform 0.32s ${EASE_OUT}`,
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
});

export const segmentedOption = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  height: 28,
  border: 'none',
  borderRadius: 999,
  background: 'transparent',
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'color 0.2s ease-in-out',
  selectors: {
    '&[data-active="true"]': {
      color: cssVarV2('text/primary'),
    },
    '&:disabled': {
      cursor: 'not-allowed',
      opacity: 0.5,
    },
  },
});

export const sectionTitle = style({
  padding: '6px 10px 2px',
  color: cssVarV2('text/tertiary'),
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
});

export const outlineList = style({
  maxHeight: 240,
  overflowY: 'auto',
});

export const outlineItem = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const emptyHint = style({
  padding: '4px 10px 6px',
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontXs'),
});

export const shareMenu = style({
  padding: 4,
  width: '420px',
  // to handle overflow when the width is not enough
  maxWidth: 'calc(var(--radix-dropdown-menu-content-available-width) - 8px)',
});
