import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const createTagWrapper = style({
  alignItems: 'center',
  padding: '8px',
  borderRadius: '8px',
  margin: '0 16px',
  display: 'flex',
  fontSize: cssVar('fontXs'),
  background: cssVar('backgroundSecondaryColor'),
  selectors: {
    '&[data-show="false"]': {
      display: 'none',
      pointerEvents: 'none',
    },
  },
});

export const tagColorIcon = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  selectors: {
    '&.large': {
      width: '16px',
      height: '16px',
    },
  },
});

export const tagItemsWrapper = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '4px',
});

export const tagItem = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  padding: '2px',
  cursor: 'pointer',
  border: `1px solid ${cssVar('backgroundOverlayPanelColor')}`,
  ':hover': {
    boxShadow: `0 0 0 1px ${cssVar('primaryColor')}`,
  },
  selectors: {
    '&.active': {
      boxShadow: `0 0 0 1px ${cssVar('primaryColor')}`,
    },
  },
});

export const cancelBtn = style({
  marginInlineStart: '20px',
  marginInlineEnd: '8px',
});

export const menuBtn = style({
  padding: '0px 10px',
  marginInlineEnd: '4px',
});
