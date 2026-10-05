import { style } from '@vanilla-extract/css';

/**
 * Mirrors directional icons (arrows, chevrons, "back"/"next") in right-to-left
 * layouts, where "previous" is on the right.
 */
export const mirrorInRtl = style({
  selectors: {
    '&:dir(rtl)': {
      transform: 'scaleX(-1)',
    },
  },
});

/**
 * For user-generated text shown in UI chrome (doc titles, previews, names):
 * the text keeps its own reading order — an English title inside the Arabic
 * UI keeps its punctuation in place, and vice versa — while its alignment
 * still follows the UI direction.
 */
export const userText = style({
  unicodeBidi: 'plaintext',
  // Physical on purpose: with `plaintext`, `start`/`end` (and
  // `match-parent`) resolve against the text's own direction, which would
  // left-align Arabic titles. `:dir()` reflects the UI direction.
  selectors: {
    '&:dir(rtl)': { textAlign: 'right' },
    '&:dir(ltr)': { textAlign: 'left' },
  },
});
