import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const mainContainer = style({
  containerType: 'inline-size',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  overflow: 'hidden',
  borderTop: `0.5px solid transparent`,
  transition: 'border-color 0.2s',
  selectors: {
    '&[data-dynamic-top-border="false"]': {
      borderColor: cssVar('borderColor'),
    },
    '&[data-has-scroll-top="true"]': {
      borderColor: cssVar('borderColor'),
    },
  },
});

export const editorContainer = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  zIndex: 0,
});
// brings styles of .affine-page-viewport from blocksuite
export const affineDocViewport = style({
  display: 'flex',
  flexDirection: 'column',
  containerName: 'viewport',
  containerType: 'inline-size',
  background: cssVar('backgroundPrimaryColor'),
  '@media': {
    print: {
      display: 'none',
      zIndex: -1,
    },
  },
  selectors: {
    '&[data-dragging="true"]': {
      backgroundColor: cssVarV2.layer.background.hoverOverlay,
    },
  },
});

export const pageModeViewportContentBox = style({});
globalStyle(
  `${pageModeViewportContentBox} >:first-child:has(>[data-affine-editor-container])`,
  // Dafater: fill the viewport (a table grows past its height with the
  // content), so the blank gap pushes the starter bar of a new doc to the
  // bottom instead of the middle of the screen.
  { display: 'table !important', minWidth: '100%', height: '100%' }
);
globalStyle(
  `${pageModeViewportContentBox} >:first-child > [data-affine-editor-container]`,
  { minHeight: '100%' }
);
globalStyle(
  `${pageModeViewportContentBox} >:first-child:has(>[data-affine-editor-container].full-screen)`,
  {
    display: 'flex !important',
    flexDirection: 'column',
    width: '100%',
    minWidth: '100%',
    height: 'auto',
    minHeight: '100%',
  }
);
globalStyle(
  `${pageModeViewportContentBox} >:first-child > [data-affine-editor-container].full-screen`,
  { flex: '1 0 auto' }
);
globalStyle(
  `${pageModeViewportContentBox} >:first-child:has(>[data-editor-loading="true"]) > [data-editor-loading="true"]`,
  { flex: 1, minHeight: '100%' }
);

export const scrollbar = style({
  marginInlineEnd: '4px',
});

export const sidebarScrollArea = style({
  height: '100%',
});
