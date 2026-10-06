import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { keyframes, style } from '@vanilla-extract/css';

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '12px 16px 10px',
  borderBottom: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  minWidth: 0,
});

export const calendarButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  height: 28,
  padding: '0 4px',
  borderRadius: 6,
  color: cssVarV2('icon/primary'),
  fontSize: 20,
  flexShrink: 0,
  cursor: 'pointer',
  selectors: {
    '&:hover': { background: cssVarV2('layer/background/hoverOverlay') },
  },
});

export const calendarChevron = style({
  fontSize: 14,
  color: cssVarV2('icon/secondary'),
});

export const titleInput = style({
  flex: '0 1 auto',
  minWidth: 60,
  width: 0,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  padding: 0,
  color: cssVarV2('text/primary'),
  fontSize: 20,
  fontWeight: 700,
  lineHeight: '28px',
  fontFamily: 'inherit',
  textOverflow: 'ellipsis',
  selectors: {
    '&::placeholder': { color: cssVarV2('text/primary') },
  },
});

export const titleSizer = style({
  position: 'absolute',
  visibility: 'hidden',
  whiteSpace: 'pre',
  fontSize: 20,
  fontWeight: 700,
  pointerEvents: 'none',
});

export const dateChip = style({
  color: cssVarV2('text/secondary'),
  fontSize: 20,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  flexShrink: 0,
  unicodeBidi: 'isolate',
  selectors: {
    '&:hover': { color: cssVarV2('text/primary') },
  },
});

export const attendees = style({
  display: 'inline-flex',
  alignItems: 'center',
  height: 28,
  marginInlineStart: 4,
  padding: '0 6px',
  gap: 4,
  borderRadius: 14,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  color: cssVarV2('icon/primary'),
  fontSize: 16,
  cursor: 'pointer',
  flexShrink: 0,
  selectors: {
    '&:hover': { background: cssVarV2('layer/background/hoverOverlay') },
  },
});

export const avatarStack = style({
  display: 'inline-flex',
});

export const avatar = style({
  width: 20,
  height: 20,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 600,
  color: cssVarV2('text/pureWhite'),
  background: cssVarV2('button/primary'),
  border: `1.5px solid ${cssVarV2('layer/background/primary')}`,
  selectors: {
    '& + &': { marginInlineStart: -6 },
  },
});

export const attendeesMenu = style({
  width: 260,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const attendeeInput = style({
  width: '100%',
  height: 30,
  padding: '0 8px',
  borderRadius: 6,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: 'transparent',
  color: cssVarV2('text/primary'),
  fontSize: cssVar('fontSm'),
  outline: 'none',
  fontFamily: 'inherit',
  selectors: {
    '&:focus': { borderColor: cssVarV2('input/border/active') },
  },
});

export const attendeeRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 4px 4px 8px',
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/primary'),
});

export const attendeeName = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const muted = style({
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontSm'),
  padding: '4px 8px',
});

export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 16px 4px',
  minWidth: 0,
});

export const tabs = style({
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  flexShrink: 0,
});

export const tab = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 32,
  padding: '0 12px',
  borderRadius: 16,
  border: 'none',
  background: 'transparent',
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  selectors: {
    '&:hover': { background: cssVarV2('layer/background/hoverOverlay') },
    '&[data-active="true"]': {
      background: cssVarV2('layer/background/secondary'),
      color: cssVarV2('text/primary'),
    },
  },
});

export const tabIcon = style({
  fontSize: 16,
  display: 'inline-flex',
});

export const spacer = style({ flex: 1, minWidth: 0 });

export const waveform = style({
  flex: 1,
  minWidth: 40,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  overflow: 'hidden',
  color: cssVarV2('text/secondary'),
});

export const waveformBar = style({
  width: 2,
  minHeight: 2,
  height: 2,
  borderRadius: 1,
  background: 'currentColor',
  flexShrink: 0,
  transition: 'height 80ms linear',
});

export const timer = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  fontVariantNumeric: 'tabular-nums',
  direction: 'ltr',
  flexShrink: 0,
});

export const actions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
});

export const iconAction = style({
  fontSize: 18,
  color: cssVarV2('icon/primary'),
});

export const splitButton = style({
  display: 'inline-flex',
  alignItems: 'stretch',
  borderRadius: 6,
  overflow: 'hidden',
  background: cssVarV2('button/primary'),
});

export const splitMain = style({
  borderRadius: 0,
  border: 'none',
  boxShadow: 'none',
});

export const splitToggle = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  border: 'none',
  borderInlineStart: '1px solid rgba(255,255,255,0.25)',
  background: 'transparent',
  color: cssVarV2('button/pureWhiteText'),
  fontSize: 16,
  cursor: 'pointer',
  selectors: {
    '&:hover': { background: 'rgba(0,0,0,0.12)' },
    '&:disabled': { cursor: 'not-allowed', opacity: 0.6 },
  },
});

export const stopButton = style({
  background: cssVarV2('layer/background/error'),
  color: cssVarV2('status/error'),
  borderColor: 'transparent',
});

export const status = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/secondary'),
  whiteSpace: 'nowrap',
});

export const menuDescription = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});

export const menuLabel = style({
  padding: '4px 8px 2px',
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  color: cssVarV2('text/secondary'),
});

export const languageMenu = style({
  maxHeight: 320,
  overflowY: 'auto',
});

export const tips = style({
  width: 300,
  padding: '4px 4px 2px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  fontSize: cssVar('fontSm'),
  lineHeight: 1.5,
  color: cssVarV2('text/primary'),
});

export const tipsTitle = style({
  fontWeight: 600,
});

export const tipsList = style({
  margin: 0,
  paddingInlineStart: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  color: cssVarV2('text/secondary'),
});

export const shareBar = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  margin: '8px 16px 0',
  padding: '8px 8px 8px 12px',
  borderRadius: 8,
  background: cssVarV2('layer/background/secondary'),
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/primary'),
  flexWrap: 'wrap',
});

export const shareButtons = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginInlineStart: 'auto',
});

export const notice = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  margin: '8px 16px 0',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: cssVar('fontSm'),
  background: cssVarV2('layer/background/secondary'),
  color: cssVarV2('text/secondary'),
  selectors: {
    '&[data-type="error"]': {
      background: cssVarV2('layer/background/error'),
      color: cssVarV2('status/error'),
    },
  },
});

export const noticeText = style({ flex: 1, minWidth: 0 });

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 16px 14px',
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/secondary'),
  minWidth: 0,
  flexWrap: 'wrap',
});

export const instructions = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
});

export const instructionsButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  height: 24,
  padding: '0 4px',
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: cssVarV2('text/primary'),
  fontSize: cssVar('fontSm'),
  fontFamily: 'inherit',
  cursor: 'pointer',
  selectors: {
    '&:hover': { background: cssVarV2('layer/background/hoverOverlay') },
  },
});

export const footerDivider = style({
  width: 1,
  height: 16,
  background: cssVarV2('layer/insideBorder/border'),
  flexShrink: 0,
});

export const footerText = style({
  flex: 1,
  minWidth: 0,
});

export const footerIcons = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 16,
});

export const feedbackButton = style({
  color: cssVarV2('icon/secondary'),
  selectors: {
    '&[data-active="true"]': { color: cssVarV2('icon/activated') },
  },
});

export const transcript = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '8px 16px 4px',
  maxHeight: 420,
  overflowY: 'auto',
});

export const segment = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
});

export const segmentTime = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  fontVariantNumeric: 'tabular-nums',
  direction: 'ltr',
  alignSelf: 'flex-start',
});

export const segmentText = style({
  fontSize: cssVar('fontBase'),
  lineHeight: 1.6,
  color: cssVarV2('text/primary'),
  unicodeBidi: 'plaintext',
  textAlign: 'start',
  whiteSpace: 'pre-wrap',
  userSelect: 'text',
});

const pulse = keyframes({
  '0%, 100%': { opacity: 0.35 },
  '50%': { opacity: 1 },
});

export const listening = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/secondary'),
  animation: `${pulse} 1.6s ease-in-out infinite`,
});

export const recordingDot = style({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: cssVarV2('status/error'),
});

export const emptyTranscript = style({
  padding: '12px 0',
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/placeholder'),
});

export const summaryStatus = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 16px 4px',
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/secondary'),
  animation: `${pulse} 1.6s ease-in-out infinite`,
});
