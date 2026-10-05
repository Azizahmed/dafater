import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const divider = style({
  marginTop: '2px',
  marginBottom: '2px',
  marginInlineStart: '12px',
  marginInlineEnd: '8px',
  height: '1px',
  background: cssVar('borderColor'),
});
