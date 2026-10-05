import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const menuTriggerStyle = style({
  paddingBlock: '4px 4px',
  paddingInlineStart: '4px',
  paddingInlineEnd: '0px',
  borderRadius: '4px',
  justifyContent: 'space-between',
  display: 'flex',
  fontSize: cssVar('fontSm'),
  fontWeight: 400,
  height: '30px',
  selectors: {
    '&.disable': {
      alignItems: 'center',
      gap: '4px',
      marginInlineEnd: '4px',
      color: cssVarV2('text/disable'),
    },
  },
});
export const menuTriggerText = style({
  margin: '0px 4px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});
export const suffixClassName = style({
  width: '20px',
  height: '20px',
});

export const rowContainerStyle = style({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginInlineStart: '4px',
});
export const exportContainerStyle = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});
export const labelStyle = style({
  fontSize: cssVar('fontSm'),
});
export const publicItemRowStyle = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});
export const tagContainerStyle = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const informationIcon = style({
  color: cssVarV2('icon/primary'),
  fontSize: '20px',
  selectors: {
    '&.disable': {
      color: cssVarV2('icon/disable'),
    },
  },
});
