import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const errorMessage = style({
  color: cssVar('--affine-error-color'),
  fontSize: '0.6rem',
  marginBlock: '4px 2px',
  marginInlineStart: '2px',
  marginInlineEnd: '8px',
});
