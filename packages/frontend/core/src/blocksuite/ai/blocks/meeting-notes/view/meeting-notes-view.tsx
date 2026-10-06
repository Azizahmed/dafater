import {
  Button,
  DatePicker,
  IconButton,
  Loading,
  Menu,
  MenuItem,
  MenuSeparator,
  notify,
  Tooltip,
  useConfirmModal,
  usePromptModal,
} from '@affine/component';
import { useSharingUrl } from '@affine/core/components/hooks/affine/use-share-url';
import { CurrentServerScopeProvider } from '@affine/core/components/providers/current-server-scope';
import { AuthService } from '@affine/core/modules/cloud';
import { GlobalDialogService } from '@affine/core/modules/dialogs';
import { useSignalValue } from '@affine/core/modules/doc-info/utils';
import {
  canCaptureTabAudio,
  canRecordAudio,
  MeetingNotesService,
  type MeetingSession,
  type RecordingSource,
} from '@affine/core/modules/meeting-notes';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { copyTextToClipboard } from '@affine/core/utils/clipboard';
import { I18n, useI18n } from '@affine/i18n';
import {
  ArrowDownSmallIcon,
  CloseIcon,
  CopyIcon,
  DateTimeIcon,
  DeleteIcon,
  EmailIcon,
  LinkIcon,
  MicrophoneIcon,
  PenIcon,
  ResetIcon,
  SummarizeIcon,
  TranscriptWithAiIcon,
  UploadIcon,
} from '@blocksuite/icons/rc';
import { computed } from '@preact/signals-core';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import dayjs from 'dayjs';
import {
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { sectionToMarkdown } from '../content';
import { MEETING_INSTRUCTIONS, type MeetingNotesInstructions } from '../model';
import type { MeetingNotesBlockHandle, MeetingNotesTab } from '../types';
import {
  AddPersonIcon,
  LightbulbIcon,
  SlidersIcon,
  SpeakerIcon,
  ThumbDownIcon,
  ThumbUpIcon,
} from './icons';
import * as styles from './meeting-notes-view.css';

const SPOKEN_LANGUAGES = [
  'ar',
  'en',
  'fr',
  'es',
  'de',
  'tr',
  'ur',
  'fa',
  'hi',
  'id',
  'ms',
  'zh',
  'ja',
  'ko',
  'ru',
  'pt',
  'it',
  'nl',
];

const MAX_AUDIO_FILE_BYTES = 500 * 1024 * 1024;

const NULL$ = new LiveData<null>(null);

/**
 * Keeps keyboard and clipboard events of the block's own controls (title,
 * attendee name…) away from the editor, which listens on `document`.
 */
const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();
const Isolated = ({ children }: { children: ReactNode }) => (
  <div
    onKeyDown={stopPropagation}
    onKeyUp={stopPropagation}
    onKeyPress={stopPropagation}
    onCopy={stopPropagation}
    onCut={stopPropagation}
    onPaste={stopPropagation}
  >
    <CurrentServerScopeProvider>{children}</CurrentServerScopeProvider>
  </div>
);

function languageName(code: string) {
  try {
    return (
      new Intl.DisplayNames([I18n.language], { type: 'language' }).of(code) ??
      code
    );
  } catch {
    return code;
  }
}

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

function pickAudioFile() {
  return new Promise<File | null>(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept =
      'audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.ogg,.opus,.webm,.aac,.flac';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

function useMeetingState(handle: MeetingNotesBlockHandle) {
  const { model } = handle;
  const service = useService(MeetingNotesService);
  const session = useLiveData(
    useMemo(() => service.session$(model.id), [service, model.id])
  );
  const sessionState = useLiveData(session?.state$ ?? NULL$);
  const summaryJob = useLiveData(
    useMemo(() => service.summary$(model.id), [service, model.id])
  );
  const hasSummary$ = useMemo(
    () => computed(() => (model.summarySection?.children.length ?? 0) > 0),
    [model]
  );
  const hasSummary = useSignalValue(hasSummary$);
  const transcript = useSignalValue(model.props.transcript$);
  const readonly = useSignalValue(model.store.readonly$);
  return {
    service,
    session,
    sessionState,
    summaryJob,
    summarizing: summaryJob?.status === 'running',
    hasSummary,
    transcript,
    readonly,
  };
}

/** The meeting is being recorded/imported in this app session. */
function isActive(state: MeetingSession['state$']['value'] | null) {
  return state !== null;
}

function useMeetingActions(handle: MeetingNotesBlockHandle) {
  const t = useI18n();
  const { model } = handle;
  const service = useService(MeetingNotesService);
  const authService = useService(AuthService);
  const globalDialogService = useService(GlobalDialogService);

  const ensureReady = useCallback(
    async (need: 'transcription' | 'summary') => {
      if (!authService.session.account$.value) {
        globalDialogService.open('sign-in', {});
        return false;
      }
      const capabilities = await service.loadCapabilities(true);
      if (!capabilities?.summary) {
        notify.error({ title: t['com.affine.meeting-notes.error.ai-off']() });
        return false;
      }
      if (need === 'transcription' && !capabilities.transcription) {
        notify.error({
          title: t['com.affine.meeting-notes.error.no-transcription'](),
        });
        return false;
      }
      return true;
    },
    [authService, globalDialogService, service, t]
  );

  const start = useCallback(
    async (source: RecordingSource) => {
      if (!canRecordAudio()) {
        notify.error({
          title: t['com.affine.meeting-notes.error.unsupported'](),
        });
        return;
      }
      if (service.recording) {
        notify.error({ title: t['com.affine.meeting-notes.error.busy']() });
        return;
      }
      if (!(await ensureReady('transcription'))) return;
      try {
        await service.startRecording(model, source);
        handle.tab$.value = 'notes';
      } catch (error) {
        const name = (error as { name?: string })?.name;
        const title =
          name === 'NotAllowedError' || name === 'SecurityError'
            ? t['com.affine.meeting-notes.error.mic-denied']()
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? t['com.affine.meeting-notes.error.no-mic']()
              : name === 'NoTabAudio'
                ? t['com.affine.meeting-notes.error.no-tab-audio']()
                : t['com.affine.meeting-notes.error.start']({
                    error: (error as Error)?.message ?? String(error),
                  });
        notify.error({ title });
      }
    },
    [ensureReady, handle, model, service, t]
  );

  const upload = useCallback(async () => {
    if (service.recording) {
      notify.error({ title: t['com.affine.meeting-notes.error.busy']() });
      return;
    }
    if (!(await ensureReady('transcription'))) return;
    const file = await pickAudioFile();
    if (!file) return;
    if (file.size > MAX_AUDIO_FILE_BYTES) {
      notify.error({
        title: t['com.affine.meeting-notes.error.file-too-large'](),
      });
      return;
    }
    handle.tab$.value = 'transcript';
    try {
      await service.transcribeFile(model, file);
    } catch (error) {
      notify.error({
        title: t['com.affine.meeting-notes.error.file']({
          error: (error as Error)?.message ?? String(error),
        }),
      });
    }
  }, [ensureReady, handle, model, service, t]);

  const summarize = useCallback(async () => {
    if (!(await ensureReady('summary'))) return;
    handle.tab$.value = 'summary';
    await service.summarize(model.store.id, model.id);
  }, [ensureReady, handle, model, service]);

  return { start, upload, summarize };
}

const Waveform = ({ session }: { session: MeetingSession }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bars = Array.from(ref.current?.children ?? []) as HTMLElement[];
    let frame = 0;
    let last = 0;
    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      if (time - last < 60) return;
      last = time;
      const levels = session.levels;
      bars.forEach((bar, index) => {
        const level = levels[levels.length - bars.length + index] ?? 0;
        bar.style.height = `${Math.max(2, Math.round(level * 22))}px`;
      });
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [session]);
  return (
    <div className={styles.waveform} ref={ref} aria-hidden="true">
      {Array.from({ length: 48 }, (_, index) => (
        <span key={index} className={styles.waveformBar} />
      ))}
    </div>
  );
};

const Timer = ({ session }: { session: MeetingSession }) => {
  const position = useLiveData(session.positionMs$);
  return <span className={styles.timer}>{formatDuration(position)}</span>;
};

const MeetingDate = ({ handle }: { handle: MeetingNotesBlockHandle }) => {
  const t = useI18n();
  const { model } = handle;
  const [now] = useState(() => Date.now());
  const date = useSignalValue(model.props.date$) || now;
  const readonly = useSignalValue(model.store.readonly$);
  const label = useMemo(() => {
    const day = dayjs(date).startOf('day');
    const today = dayjs().startOf('day');
    const diff = day.diff(today, 'day');
    if (diff === 0) return t['com.affine.meeting-notes.date.today']();
    if (diff === -1) return t['com.affine.meeting-notes.date.yesterday']();
    if (diff === 1) return t['com.affine.meeting-notes.date.tomorrow']();
    return new Intl.DateTimeFormat(I18n.language, {
      day: 'numeric',
      month: 'short',
      year: day.year() === today.year() ? undefined : 'numeric',
    }).format(date);
  }, [date, t]);

  const onChange = useCallback(
    (value: string) => {
      const picked = dayjs(value, 'YYYY-MM-DD');
      if (!picked.isValid()) return;
      model.store.updateBlock(model, {
        date: picked
          .hour(dayjs(date).hour())
          .minute(dayjs(date).minute())
          .valueOf(),
      });
    },
    [date, model]
  );

  const picker = (
    <DatePicker value={dayjs(date).format('YYYY-MM-DD')} onChange={onChange} />
  );
  return (
    <>
      <Menu items={picker} rootOptions={{ modal: false }}>
        <Tooltip content={t['com.affine.meeting-notes.date.tooltip']()}>
          <button
            type="button"
            className={styles.calendarButton}
            disabled={readonly}
            data-testid="meeting-notes-date"
          >
            <DateTimeIcon />
            <ArrowDownSmallIcon className={styles.calendarChevron} />
          </button>
        </Tooltip>
      </Menu>
      <MeetingTitle handle={handle} />
      <Menu items={picker} rootOptions={{ modal: false }}>
        <span className={styles.dateChip}>@{label}</span>
      </Menu>
    </>
  );
};

const MeetingTitle = ({ handle }: { handle: MeetingNotesBlockHandle }) => {
  const t = useI18n();
  const { model } = handle;
  const title = useSignalValue(model.props.title$);
  const readonly = useSignalValue(model.store.readonly$);
  const [draft, setDraft] = useState(title);
  const sizer = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const placeholder = t['com.affine.meeting-notes.title.placeholder']();

  useEffect(() => setDraft(title), [title]);
  // grow with the text, so the date sits right after the title
  useEffect(() => {
    if (sizer.current && input.current) {
      input.current.style.width = `${sizer.current.offsetWidth + 4}px`;
    }
  }, [draft, placeholder]);

  return (
    <>
      <span ref={sizer} className={styles.titleSizer} aria-hidden="true">
        {draft || placeholder}
      </span>
      <input
        ref={input}
        className={styles.titleInput}
        value={draft}
        placeholder={placeholder}
        readOnly={readonly}
        dir="auto"
        data-testid="meeting-notes-title"
        aria-label={t['com.affine.meeting-notes.title.label']()}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => {
          const value = draft.trim();
          if (value !== title) model.store.updateBlock(model, { title: value });
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
            handle.focusNotes();
          }
          if (event.key === 'Escape') {
            setDraft(title);
            event.currentTarget.blur();
          }
        }}
      />
    </>
  );
};

const Attendees = ({ handle }: { handle: MeetingNotesBlockHandle }) => {
  const t = useI18n();
  const { model } = handle;
  const attendees = useSignalValue(model.props.attendees$);
  const readonly = useSignalValue(model.store.readonly$);
  const account = useLiveData(useService(AuthService).session.account$);
  const [name, setName] = useState('');
  const list = useMemo(() => [...attendees], [attendees]);

  const update = useCallback(
    (next: string[]) => model.store.updateBlock(model, { attendees: next }),
    [model]
  );
  const add = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || list.includes(trimmed)) return;
      update([...list, trimmed]);
    },
    [list, update]
  );

  const items = (
    <div className={styles.attendeesMenu}>
      {!readonly && (
        <input
          className={styles.attendeeInput}
          value={name}
          dir="auto"
          autoFocus
          placeholder={t['com.affine.meeting-notes.attendees.placeholder']()}
          data-testid="meeting-notes-attendee-input"
          onChange={event => setName(event.target.value)}
          onKeyDown={event => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              add(name);
              setName('');
            }
          }}
        />
      )}
      {list.length === 0 ? (
        <div className={styles.muted}>
          {t['com.affine.meeting-notes.attendees.empty']()}
        </div>
      ) : (
        list.map(person => (
          <div key={person} className={styles.attendeeRow}>
            <span className={styles.attendeeName} dir="auto">
              {person}
            </span>
            {!readonly && (
              <IconButton
                size="16"
                tooltip={t['com.affine.meeting-notes.attendees.remove']()}
                onClick={() => update(list.filter(item => item !== person))}
              >
                <CloseIcon />
              </IconButton>
            )}
          </div>
        ))
      )}
      {!readonly && account?.label && !list.includes(account.label) && (
        <MenuItem onSelect={() => add(account.label)}>
          {t['com.affine.meeting-notes.attendees.add-me']()}
        </MenuItem>
      )}
    </div>
  );

  return (
    <Menu items={items} contentOptions={{ align: 'start' }}>
      <button
        type="button"
        className={styles.attendees}
        aria-label={t['com.affine.meeting-notes.attendees.label']()}
        data-testid="meeting-notes-attendees"
      >
        {list.length > 0 && (
          <span className={styles.avatarStack}>
            {list.slice(0, 3).map(person => (
              <span key={person} className={styles.avatar}>
                {Array.from(person.trim())[0]?.toUpperCase()}
              </span>
            ))}
          </span>
        )}
        <AddPersonIcon />
      </button>
    </Menu>
  );
};

const Tips = () => {
  const t = useI18n();
  return (
    <Menu
      items={
        <div className={styles.tips}>
          <div className={styles.tipsTitle}>
            {t['com.affine.meeting-notes.tips.title']()}
          </div>
          <ul className={styles.tipsList}>
            <li>{t['com.affine.meeting-notes.tips.agenda']()}</li>
            <li>{t['com.affine.meeting-notes.tips.microphone']()}</li>
            <li>{t['com.affine.meeting-notes.tips.online']()}</li>
            <li>{t['com.affine.meeting-notes.tips.language']()}</li>
          </ul>
        </div>
      }
      contentOptions={{ align: 'end' }}
    >
      <IconButton
        size="20"
        className={styles.iconAction}
        tooltip={t['com.affine.meeting-notes.tips.tooltip']()}
        data-testid="meeting-notes-tips"
      >
        <LightbulbIcon />
      </IconButton>
    </Menu>
  );
};

const SettingsMenu = ({
  handle,
  onUpload,
  onSummarize,
  onContinue,
  canContinue,
}: {
  handle: MeetingNotesBlockHandle;
  onUpload: () => void;
  onSummarize: () => void;
  onContinue: () => void;
  canContinue: boolean;
}) => {
  const t = useI18n();
  const { model } = handle;
  const { transcript, hasSummary, summarizing, readonly, sessionState } =
    useMeetingState(handle);
  const language = useSignalValue(model.props.language$);
  const confirmModal = useConfirmModal();
  const active = isActive(sessionState);

  const copyTranscript = useCallback(() => {
    const text = transcript
      .map(segment => `[${formatDuration(segment.start)}] ${segment.text}`)
      .join('\n');
    copyTextToClipboard(text)
      .then(() =>
        notify.success({ title: t['com.affine.meeting-notes.copied']() })
      )
      .catch(console.error);
  }, [t, transcript]);

  const deleteTranscript = useCallback(() => {
    confirmModal.openConfirmModal({
      title: t['com.affine.meeting-notes.delete-transcript.title'](),
      description:
        t['com.affine.meeting-notes.delete-transcript.description'](),
      confirmText: t['com.affine.meeting-notes.delete-transcript.confirm'](),
      cancelText: t['Cancel'](),
      confirmButtonOptions: { variant: 'error' },
      onConfirm: () => {
        model.store.updateBlock(model, { transcript: [], durationMs: 0 });
        if (handle.tab$.value === 'transcript') handle.tab$.value = 'notes';
      },
    });
  }, [confirmModal, handle, model, t]);

  const items = (
    <>
      <div className={styles.menuLabel}>
        {t['com.affine.meeting-notes.settings.language']()}
      </div>
      <div className={styles.languageMenu}>
        {['auto', ...SPOKEN_LANGUAGES].map(code => (
          <MenuItem
            key={code}
            selected={language === code}
            disabled={readonly || active}
            onSelect={() => model.store.updateBlock(model, { language: code })}
          >
            {code === 'auto'
              ? t['com.affine.meeting-notes.settings.language.auto']()
              : languageName(code)}
          </MenuItem>
        ))}
      </div>
      {!readonly && (
        <>
          <MenuSeparator />
          {canContinue && (
            <MenuItem prefixIcon={<MicrophoneIcon />} onSelect={onContinue}>
              {t['com.affine.meeting-notes.continue']()}
            </MenuItem>
          )}
          <MenuItem
            prefixIcon={<UploadIcon />}
            disabled={active}
            onSelect={onUpload}
          >
            {t['com.affine.meeting-notes.upload']()}
          </MenuItem>
          {(hasSummary || transcript.length > 0) && (
            <MenuItem
              prefixIcon={<ResetIcon />}
              disabled={summarizing || active}
              onSelect={onSummarize}
            >
              {hasSummary
                ? t['com.affine.meeting-notes.regenerate']()
                : t['com.affine.meeting-notes.generate']()}
            </MenuItem>
          )}
        </>
      )}
      {transcript.length > 0 && (
        <>
          <MenuSeparator />
          <MenuItem prefixIcon={<CopyIcon />} onSelect={copyTranscript}>
            {t['com.affine.meeting-notes.copy-transcript']()}
          </MenuItem>
          {!readonly && (
            <MenuItem
              type="danger"
              prefixIcon={<DeleteIcon />}
              disabled={active}
              onSelect={deleteTranscript}
            >
              {t['com.affine.meeting-notes.delete-transcript']()}
            </MenuItem>
          )}
        </>
      )}
    </>
  );

  return (
    <Menu items={items} contentOptions={{ align: 'end' }}>
      <IconButton
        size="20"
        className={styles.iconAction}
        tooltip={t['com.affine.meeting-notes.settings.tooltip']()}
        data-testid="meeting-notes-settings"
      >
        <SlidersIcon />
      </IconButton>
    </Menu>
  );
};

const StartButton = ({
  label,
  onStart,
  onUpload,
  disabled,
}: {
  label: string;
  onStart: (source: RecordingSource) => void;
  onUpload: () => void;
  disabled?: boolean;
}) => {
  const t = useI18n();
  const tabAudio = canCaptureTabAudio();
  return (
    <div className={styles.splitButton}>
      <Button
        variant="primary"
        className={styles.splitMain}
        disabled={disabled}
        onClick={() => onStart('microphone')}
        data-testid="meeting-notes-start"
      >
        {label}
      </Button>
      <Menu
        contentOptions={{ align: 'end' }}
        items={
          <>
            <MenuItem
              prefixIcon={<MicrophoneIcon />}
              onSelect={() => onStart('microphone')}
            >
              {t['com.affine.meeting-notes.source.microphone']()}
            </MenuItem>
            {tabAudio && (
              <MenuItem
                prefixIcon={<TranscriptWithAiIcon />}
                onSelect={() => onStart('microphone-and-tab')}
              >
                <div>{t['com.affine.meeting-notes.source.tab']()}</div>
                <div className={styles.menuDescription}>
                  {t['com.affine.meeting-notes.source.tab.description']()}
                </div>
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem prefixIcon={<UploadIcon />} onSelect={onUpload}>
              {t['com.affine.meeting-notes.upload']()}
            </MenuItem>
          </>
        }
      >
        <button
          type="button"
          className={styles.splitToggle}
          disabled={disabled}
          aria-label={t['com.affine.meeting-notes.source.more']()}
          data-testid="meeting-notes-start-menu"
        >
          <ArrowDownSmallIcon />
        </button>
      </Menu>
    </div>
  );
};

const Tabs = ({ handle }: { handle: MeetingNotesBlockHandle }) => {
  const t = useI18n();
  const tab = useSignalValue(handle.tab$);
  const { hasSummary, summaryJob, transcript, sessionState } =
    useMeetingState(handle);
  const tabs: { id: MeetingNotesTab; label: string; icon: ReactNode }[] = [];
  if (hasSummary || summaryJob) {
    tabs.push({
      id: 'summary',
      label: t['com.affine.meeting-notes.tab.summary'](),
      icon: <SummarizeIcon />,
    });
  }
  tabs.push({
    id: 'notes',
    label: t['com.affine.meeting-notes.tab.notes'](),
    icon: <PenIcon />,
  });
  if (transcript.length > 0 || isActive(sessionState)) {
    tabs.push({
      id: 'transcript',
      label: t['com.affine.meeting-notes.tab.transcript'](),
      icon: <TranscriptWithAiIcon />,
    });
  }
  return (
    <div className={styles.tabs} role="tablist">
      {tabs.map(item => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          data-active={tab === item.id}
          data-testid={`meeting-notes-tab-${item.id}`}
          className={styles.tab}
          onClick={() => (handle.tab$.value = item.id)}
        >
          <span className={styles.tabIcon}>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
};

const ShareBar = ({ handle }: { handle: MeetingNotesBlockHandle }) => {
  const t = useI18n();
  const { model } = handle;
  const workspaceId = useService(WorkspaceService).workspace.id;
  const { onClickCopyLink } = useSharingUrl({
    workspaceId,
    pageId: model.store.id,
  });
  const title = useSignalValue(model.props.title$);

  const summaryText = useCallback(() => {
    const body = sectionToMarkdown(model.summarySection);
    return title ? `# ${title}\n\n${body}` : body;
  }, [model, title]);

  return (
    <div className={styles.shareBar} data-testid="meeting-notes-share">
      <span>{t['com.affine.meeting-notes.share.title']()}</span>
      <div className={styles.shareButtons}>
        <Button
          prefix={<LinkIcon />}
          onClick={() => onClickCopyLink(undefined, [model.id])}
        >
          {t['com.affine.meeting-notes.share.copy-link']()}
        </Button>
        <Button
          prefix={<EmailIcon />}
          onClick={() => {
            const subject =
              title || t['com.affine.meeting-notes.title.placeholder']();
            window.open(
              `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(summaryText())}`,
              '_blank'
            );
          }}
        >
          {t['com.affine.meeting-notes.share.email']()}
        </Button>
        <Button
          prefix={<CopyIcon />}
          onClick={() => {
            copyTextToClipboard(summaryText())
              .then(() =>
                notify.success({
                  title: t['com.affine.meeting-notes.copied'](),
                })
              )
              .catch(console.error);
          }}
        >
          {t['com.affine.meeting-notes.share.copy-text']()}
        </Button>
        <IconButton
          size="16"
          tooltip={t['com.affine.meeting-notes.share.close']()}
          onClick={() => (handle.shareBarDismissed$.value = true)}
        >
          <CloseIcon />
        </IconButton>
      </div>
    </div>
  );
};

const SessionNotice = ({ session }: { session: MeetingSession }) => {
  const t = useI18n();
  const failed = useLiveData(session.failed$);
  const error = useLiveData(session.lastError$);
  if (!failed.length) return null;
  return (
    <div className={styles.notice} data-type="error">
      <span className={styles.noticeText}>
        {t['com.affine.meeting-notes.transcript.failed']({
          error: error ?? '',
        })}
      </span>
      <Button onClick={() => session.retryFailed()}>
        {t['com.affine.meeting-notes.retry']()}
      </Button>
    </div>
  );
};

const MeetingNotesTopInner = ({
  handle,
}: {
  handle: MeetingNotesBlockHandle;
}) => {
  const t = useI18n();
  const state = useMeetingState(handle);
  const { service, session, sessionState, summaryJob, summarizing } = state;
  const { start, upload, summarize } = useMeetingActions(handle);
  const tab = useSignalValue(handle.tab$);
  const shareDismissed = useSignalValue(handle.shareBarDismissed$);
  const account = useLiveData(useService(AuthService).session.account$);

  useEffect(() => {
    if (account) service.loadCapabilities().catch(console.error);
  }, [account, service]);

  const hasTranscript = state.transcript.length > 0;
  const recording = sessionState === 'recording';
  const paused = sessionState === 'paused';
  const stopping = sessionState === 'stopping';
  const importing = sessionState === 'importing';
  const starting = sessionState === 'starting';

  let actions: ReactNode = null;
  if (recording || paused) {
    actions = (
      <>
        {session && <Timer session={session} />}
        <Button
          onClick={() => {
            if (recording) session?.pause();
            else session?.resume().catch(console.error);
          }}
          data-testid="meeting-notes-pause"
        >
          {recording
            ? t['com.affine.meeting-notes.pause']()
            : t['com.affine.meeting-notes.resume']()}
        </Button>
        <Button
          className={styles.stopButton}
          onClick={() => {
            session?.stop(true).catch(console.error);
          }}
          data-testid="meeting-notes-stop"
        >
          {t['com.affine.meeting-notes.stop']()}
        </Button>
      </>
    );
  } else if (starting || stopping || importing || summarizing) {
    actions = (
      <span className={styles.status} data-testid="meeting-notes-status">
        <Loading size={14} />
        {importing
          ? t['com.affine.meeting-notes.status.importing']()
          : stopping
            ? t['com.affine.meeting-notes.status.finishing']()
            : starting
              ? t['com.affine.meeting-notes.status.starting']()
              : t['com.affine.meeting-notes.status.summarizing']()}
      </span>
    );
  } else if (!state.readonly && !state.hasSummary && !hasTranscript) {
    actions = (
      <StartButton
        label={t['com.affine.meeting-notes.start']()}
        onStart={source => void start(source)}
        onUpload={() => void upload()}
      />
    );
  } else if (!state.readonly && !state.hasSummary) {
    actions = (
      <Button
        variant="primary"
        onClick={() => void summarize()}
        data-testid="meeting-notes-generate"
      >
        {t['com.affine.meeting-notes.generate']()}
      </Button>
    );
  }

  return (
    <>
      <div className={styles.header}>
        <MeetingDate handle={handle} />
        <Attendees handle={handle} />
      </div>
      <div className={styles.toolbar}>
        <Tabs handle={handle} />
        {(recording || paused) && session ? (
          <Waveform session={session} />
        ) : (
          <div className={styles.spacer} />
        )}
        <div className={styles.actions}>
          {!state.hasSummary && <Tips />}
          <SettingsMenu
            handle={handle}
            onUpload={() => void upload()}
            onSummarize={() => void summarize()}
            onContinue={() => void start('microphone')}
            canContinue={
              !isActive(sessionState) && (hasTranscript || state.hasSummary)
            }
          />
          {actions}
        </div>
      </div>
      {session && <SessionNotice session={session} />}
      {summaryJob?.status === 'error' && (
        <div className={styles.notice} data-type="error">
          <span className={styles.noticeText}>
            {t['com.affine.meeting-notes.error.summary']({
              error: summaryJob.message,
            })}
          </span>
          <Button onClick={() => void summarize()}>
            {t['com.affine.meeting-notes.retry']()}
          </Button>
          <IconButton
            size="16"
            onClick={() => service.dismissSummaryError(handle.model.id)}
          >
            <CloseIcon />
          </IconButton>
        </div>
      )}
      {tab === 'summary' &&
        state.hasSummary &&
        !summarizing &&
        !shareDismissed && <ShareBar handle={handle} />}
    </>
  );
};

export const MeetingNotesTop = ({
  handle,
}: {
  handle: MeetingNotesBlockHandle;
}) => (
  <Isolated>
    <MeetingNotesTopInner handle={handle} />
  </Isolated>
);

const TranscriptInner = ({ handle }: { handle: MeetingNotesBlockHandle }) => {
  const t = useI18n();
  const { transcript, sessionState, session } = useMeetingState(handle);
  const pending = useLiveData(session?.pending$ ?? NULL$);
  const list = useRef<HTMLDivElement>(null);
  const live = sessionState === 'recording' || sessionState === 'importing';

  useEffect(() => {
    const element = list.current;
    if (live && element) element.scrollTop = element.scrollHeight;
  }, [live, transcript.length]);

  return (
    <div
      className={styles.transcript}
      ref={list}
      data-testid="meeting-notes-transcript"
    >
      {transcript.length === 0 && !live && (
        <div className={styles.emptyTranscript}>
          {t['com.affine.meeting-notes.transcript.empty']()}
        </div>
      )}
      {transcript.map(segment => (
        <div key={segment.id} className={styles.segment}>
          <span className={styles.segmentTime}>
            {formatDuration(segment.start)}
          </span>
          <span className={styles.segmentText}>{segment.text}</span>
        </div>
      ))}
      {live && (
        <span className={styles.listening}>
          <span className={styles.recordingDot} />
          {pending
            ? t['com.affine.meeting-notes.transcript.transcribing']()
            : t['com.affine.meeting-notes.transcript.listening']()}
        </span>
      )}
      {sessionState === 'paused' && (
        <span className={styles.emptyTranscript}>
          {t['com.affine.meeting-notes.transcript.paused']()}
        </span>
      )}
    </div>
  );
};

export const MeetingNotesTranscript = ({
  handle,
}: {
  handle: MeetingNotesBlockHandle;
}) => (
  <Isolated>
    <TranscriptInner handle={handle} />
  </Isolated>
);

const SummaryStatusInner = ({
  handle,
}: {
  handle: MeetingNotesBlockHandle;
}) => {
  const t = useI18n();
  const { summarizing } = useMeetingState(handle);
  if (!summarizing) return null;
  return (
    <div
      className={styles.summaryStatus}
      data-testid="meeting-notes-summarizing"
    >
      <Loading size={14} />
      {t['com.affine.meeting-notes.status.summarizing-long']()}
    </div>
  );
};

export const MeetingNotesSummaryStatus = ({
  handle,
}: {
  handle: MeetingNotesBlockHandle;
}) => (
  <Isolated>
    <SummaryStatusInner handle={handle} />
  </Isolated>
);

const INSTRUCTION_KEYS = {
  auto: 'com.affine.meeting-notes.instructions.auto',
  brief: 'com.affine.meeting-notes.instructions.brief',
  detailed: 'com.affine.meeting-notes.instructions.detailed',
  'action-items': 'com.affine.meeting-notes.instructions.action-items',
  lecture: 'com.affine.meeting-notes.instructions.lecture',
  interview: 'com.affine.meeting-notes.instructions.interview',
  standup: 'com.affine.meeting-notes.instructions.standup',
  custom: 'com.affine.meeting-notes.instructions.custom',
} as const satisfies Record<MeetingNotesInstructions, string>;

const FooterInner = ({ handle }: { handle: MeetingNotesBlockHandle }) => {
  const t = useI18n();
  const { model } = handle;
  const { hasSummary, summarizing, readonly, sessionState } =
    useMeetingState(handle);
  const { summarize } = useMeetingActions(handle);
  const instructions = useSignalValue(model.props.instructions$);
  const customInstructions = useSignalValue(model.props.customInstructions$);
  const feedback = useSignalValue(model.props.feedback$);
  const { openPromptModal } = usePromptModal();
  const consent = t['com.affine.meeting-notes.consent.message']();

  const choose = useCallback(
    (value: MeetingNotesInstructions, custom?: string) => {
      model.store.updateBlock(model, {
        instructions: value,
        ...(custom === undefined ? {} : { customInstructions: custom }),
      });
      // a new format for an existing summary: write it again
      if (hasSummary && !summarizing && !isActive(sessionState)) {
        summarize().catch(console.error);
      }
    },
    [hasSummary, model, sessionState, summarize, summarizing]
  );

  const editCustom = useCallback(() => {
    openPromptModal({
      title: t['com.affine.meeting-notes.instructions.custom.title'](),
      description:
        t['com.affine.meeting-notes.instructions.custom.description'](),
      defaultValue: customInstructions,
      confirmText: t['com.affine.meeting-notes.instructions.custom.save'](),
      cancelText: t['Cancel'](),
      inputOptions: {
        placeholder:
          t['com.affine.meeting-notes.instructions.custom.placeholder'](),
        maxLength: 2000,
      },
      onConfirm: value => {
        const text = value.trim();
        if (text) choose('custom', text);
      },
    });
  }, [choose, customInstructions, openPromptModal, t]);

  const speak = useCallback(() => {
    const speech = window.speechSynthesis;
    if (!speech) return;
    const utterance = new SpeechSynthesisUtterance(consent);
    utterance.lang = I18n.language;
    speech.cancel();
    speech.speak(utterance);
  }, [consent]);

  const copyConsent = useCallback(() => {
    copyTextToClipboard(consent)
      .then(() =>
        notify.success({ title: t['com.affine.meeting-notes.copied']() })
      )
      .catch(console.error);
  }, [consent, t]);

  const setFeedback = useCallback(
    (value: 'up' | 'down') => {
      const next = feedback === value ? '' : value;
      model.store.updateBlock(model, { feedback: next });
      if (next === 'up') {
        notify.success({
          title: t['com.affine.meeting-notes.feedback.thanks'](),
        });
      } else if (next === 'down') {
        notify({
          title: t['com.affine.meeting-notes.feedback.thanks'](),
          message: t['com.affine.meeting-notes.feedback.down-hint'](),
        });
      }
    },
    [feedback, model, t]
  );

  const instructionItems = (
    <>
      {MEETING_INSTRUCTIONS.filter(value => value !== 'custom').map(value => (
        <MenuItem
          key={value}
          selected={instructions === value}
          onSelect={() => choose(value)}
          data-testid={`meeting-notes-instructions-${value}`}
        >
          {t[INSTRUCTION_KEYS[value]]()}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem
        selected={instructions === 'custom'}
        onSelect={editCustom}
        data-testid="meeting-notes-instructions-custom"
      >
        {t[INSTRUCTION_KEYS.custom]()}
      </MenuItem>
    </>
  );

  return (
    <div className={styles.footer}>
      <span className={styles.instructions}>
        {t['com.affine.meeting-notes.instructions.label']()}
        <Menu items={instructionItems} contentOptions={{ align: 'start' }}>
          <button
            type="button"
            className={styles.instructionsButton}
            disabled={readonly}
            data-testid="meeting-notes-instructions"
          >
            {t[INSTRUCTION_KEYS[instructions] ?? INSTRUCTION_KEYS.auto]()}
            <ArrowDownSmallIcon />
          </button>
        </Menu>
      </span>
      <span className={styles.footerDivider} />
      {hasSummary ? (
        <>
          <span className={styles.footerText}>
            {t['com.affine.meeting-notes.feedback.question']()}
          </span>
          <span className={styles.footerIcons}>
            <IconButton
              size="16"
              className={styles.feedbackButton}
              data-active={feedback === 'up'}
              disabled={readonly}
              tooltip={t['com.affine.meeting-notes.feedback.up']()}
              onClick={() => setFeedback('up')}
            >
              <ThumbUpIcon />
            </IconButton>
            <IconButton
              size="16"
              className={styles.feedbackButton}
              data-active={feedback === 'down'}
              disabled={readonly}
              tooltip={t['com.affine.meeting-notes.feedback.down']()}
              onClick={() => setFeedback('down')}
            >
              <ThumbDownIcon />
            </IconButton>
          </span>
        </>
      ) : (
        <>
          <span className={styles.footerText}>
            {t['com.affine.meeting-notes.consent.notice']()}
          </span>
          <span className={styles.footerIcons}>
            {typeof window !== 'undefined' && 'speechSynthesis' in window && (
              <IconButton
                size="16"
                tooltip={t['com.affine.meeting-notes.consent.speak']()}
                onClick={speak}
              >
                <SpeakerIcon />
              </IconButton>
            )}
            <IconButton
              size="16"
              tooltip={t['com.affine.meeting-notes.consent.copy']()}
              onClick={copyConsent}
            >
              <CopyIcon />
            </IconButton>
          </span>
        </>
      )}
    </div>
  );
};

export const MeetingNotesFooter = ({
  handle,
}: {
  handle: MeetingNotesBlockHandle;
}) => (
  <Isolated>
    <FooterInner handle={handle} />
  </Isolated>
);
