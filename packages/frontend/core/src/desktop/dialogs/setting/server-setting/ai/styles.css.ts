import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const field = style({
  marginTop: '8px',
});

export const note = style({
  marginTop: '4px',
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  lineHeight: '20px',
});

export const advancedToggle = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: 0,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  color: cssVarV2('text/primary'),
});

export const advancedChevron = style({
  display: 'inline-flex',
  transition: 'transform 0.2s',
  selectors: {
    '&[data-open="true"]': {
      transform: 'rotate(180deg)',
    },
  },
});

export const advancedBody = style({
  marginTop: '16px',
});

export const actions = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '12px',
  marginTop: '24px',
});

export const result = style({
  marginTop: '16px',
  padding: '10px 12px',
  borderRadius: '8px',
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: cssVarV2('layer/background/secondary'),
  overflowWrap: 'anywhere',
});

export const resultTitle = style({
  fontWeight: 600,
  selectors: {
    '&[data-ok="true"]': {
      color: cssVarV2('status/success'),
    },
    '&[data-ok="false"]': {
      color: cssVarV2('status/error'),
    },
  },
});

export const resultDetail = style({
  marginTop: '2px',
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontXs'),
});

export const loading = style({
  padding: '24px 0',
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontSm'),
});

export const error = style({
  padding: '24px 0',
  color: cssVarV2('status/error'),
  fontSize: cssVar('fontSm'),
});
