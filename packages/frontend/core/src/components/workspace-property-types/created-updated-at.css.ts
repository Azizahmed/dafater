import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const empty = style({
  color: cssVarV2.text.placeholder,
});

export const tooltip = style({
  display: 'inline-block',
  selectors: {
    '&::first-letter': {
      textTransform: 'uppercase',
    },
  },
});

export const dateDocListInlineProperty = style({
  width: 60,
  textAlign: 'center',
  fontSize: 12,
  lineHeight: '20px',
  color: cssVarV2.text.secondary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flexShrink: 0,
  selectors: {
    // Arabic relative dates are longer («قبل ثانية واحدة», «قبل 12 دقيقة»).
    ':root:lang(ar) &': {
      width: 96,
    },
  },
});
