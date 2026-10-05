import { createVar, style } from '@vanilla-extract/css';

/** 1 in LTR, -1 in RTL: mirrors transform-based item positions. */
export const inlineSign = createVar();

export const root = style({
  position: 'relative',
  selectors: {
    '&.scrollable': {
      overflowY: 'auto',
    },
  },
});

export const groupHeader = style({
  zIndex: 1,
});

export const stickyGroupHeader = style({
  zIndex: 1,
  position: 'absolute',
  insetInlineStart: 0,
  top: 0,
  width: '100%',
});
export const scrollbar = style({
  zIndex: 1,
});

export const item = style({
  position: 'absolute',
  vars: { [inlineSign]: '1' },
  selectors: {
    '&:dir(rtl)': { vars: { [inlineSign]: '-1' } },
  },
});
