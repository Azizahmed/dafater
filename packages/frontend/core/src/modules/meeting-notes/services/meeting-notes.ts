import {
  sectionToMarkdown,
  writeSummary,
} from '@affine/core/blocksuite/ai/blocks/meeting-notes/content';
import {
  MeetingNotesBlockFlavour,
  type MeetingNotesBlockModel,
} from '@affine/core/blocksuite/ai/blocks/meeting-notes/model';
import { parseSummaryMarkdown } from '@affine/core/blocksuite/ai/blocks/meeting-notes/summary-markdown';
import { DebugLogger } from '@affine/debug';
import { I18n } from '@affine/i18n';
import { LiveData, Service } from '@toeverything/infra';

import type { DefaultServerService, WorkspaceServerService } from '../../cloud';
import { FetchService } from '../../cloud';
import type { DocsService } from '../../doc';
import {
  errorMessage,
  MeetingNotesApi,
  type MeetingNotesCapabilities,
} from '../api';
import { MeetingSession } from '../entities/meeting-session';
import type { RecordingSource } from '../recorder/recorder';

const logger = new DebugLogger('affine:meeting-notes');

export type MeetingSummaryJob =
  | { status: 'running' }
  | { status: 'error'; message: string };

type DocRef = {
  release: () => void;
  model: () => MeetingNotesBlockModel | null;
};

/**
 * Dafater: AI meeting notes for the current workspace. Recordings live here,
 * not in the block, so they keep going while the user reads another doc.
 */
export class MeetingNotesService extends Service {
  readonly sessions$ = new LiveData<MeetingSession[]>([]);
  readonly summaries$ = new LiveData<Record<string, MeetingSummaryJob>>({});
  /** null while unknown (not loaded, or the user is signed out) */
  readonly capabilities$ = new LiveData<MeetingNotesCapabilities | null>(null);

  private readonly docRefs = new Map<string, DocRef & { count: number }>();
  private readonly sessionRefs = new Map<MeetingSession, DocRef>();
  private capabilitiesRequest: Promise<MeetingNotesCapabilities | null> | null =
    null;

  constructor(
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly defaultServerService: DefaultServerService,
    private readonly docsService: DocsService
  ) {
    super();
    this.disposables.push(() => {
      this.sessions$.value.forEach(session => session.dispose());
      this.sessionRefs.forEach(ref => ref.release());
      this.sessionRefs.clear();
      window.removeEventListener('beforeunload', this.onBeforeUnload);
    });
  }

  private get server() {
    return (
      this.workspaceServerService.server ?? this.defaultServerService.server
    );
  }

  api() {
    const fetchService = this.server?.scope.getOptional(FetchService);
    return fetchService ? new MeetingNotesApi(fetchService) : null;
  }

  session$(blockId: string) {
    return this.sessions$.map(
      sessions => sessions.find(session => session.blockId === blockId) ?? null
    );
  }

  summary$(blockId: string) {
    return this.summaries$.map(jobs => jobs[blockId] ?? null);
  }

  get recording() {
    return this.sessions$.value.length > 0;
  }

  /** Loads what the server supports; cached until `force`. */
  loadCapabilities(force = false) {
    if (this.capabilitiesRequest && !force) return this.capabilitiesRequest;
    const api = this.api();
    const request = (async () => {
      try {
        const capabilities = api ? await api.capabilities() : null;
        this.capabilities$.setValue(capabilities);
        return capabilities;
      } catch (error) {
        logger.warn('capabilities unavailable', error);
        this.capabilities$.setValue(null);
        // try again next time
        this.capabilitiesRequest = null;
        return null;
      }
    })();
    this.capabilitiesRequest = request;
    return request;
  }

  async startRecording(
    model: MeetingNotesBlockModel,
    source: RecordingSource
  ): Promise<MeetingSession> {
    const session = this.createSession(model);
    try {
      await session.record(source);
    } catch (error) {
      this.removeSession(session);
      throw error;
    }
    return session;
  }

  async transcribeFile(model: MeetingNotesBlockModel, file: Blob) {
    const session = this.createSession(model);
    await session.importFile(file);
  }

  private createSession(model: MeetingNotesBlockModel) {
    const blockId = model.id;
    const docId = model.store.id;
    if (this.sessions$.value.some(session => session.blockId === blockId)) {
      throw new Error('This meeting is already being transcribed');
    }
    const ref = this.retain(docId, blockId);
    const session = new MeetingSession(
      blockId,
      docId,
      {
        api: () => this.api(),
        model: ref.model,
        ended: (ended, summarize) => {
          // retains the doc before the session lets it go
          if (summarize) {
            this.summarize(ended.docId, ended.blockId).catch(logger.error);
          }
          this.removeSession(ended);
        },
      },
      {
        offsetMs: model.props.durationMs,
        language: model.props.language,
      }
    );
    this.sessionRefs.set(session, ref);
    this.sessions$.setValue([...this.sessions$.value, session]);
    if (!BUILD_CONFIG.isElectron) {
      window.addEventListener('beforeunload', this.onBeforeUnload);
    }
    return session;
  }

  private removeSession(session: MeetingSession) {
    const sessions = this.sessions$.value.filter(item => item !== session);
    this.sessions$.setValue(sessions);
    if (!sessions.length) {
      window.removeEventListener('beforeunload', this.onBeforeUnload);
    }
    this.sessionRefs.get(session)?.release();
    this.sessionRefs.delete(session);
  }

  private readonly onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!this.recording) return;
    event.preventDefault();
    event.returnValue = '';
  };

  /**
   * Keeps the doc open (and its block reachable) while a recording or a
   * summary is in progress, even if the user leaves the doc.
   */
  private retain(docId: string, blockId: string): DocRef {
    let entry = this.docRefs.get(blockId);
    if (!entry) {
      const { doc, release } = this.docsService.open(docId);
      const store = doc.blockSuiteDoc;
      entry = {
        count: 0,
        release,
        model: () => {
          const model = store.getModelById(blockId);
          return model?.flavour === MeetingNotesBlockFlavour
            ? (model as MeetingNotesBlockModel)
            : null;
        },
      };
      this.docRefs.set(blockId, entry);
    }
    const shared = entry;
    shared.count++;
    let released = false;
    return {
      model: shared.model,
      release: () => {
        if (released) return;
        released = true;
        if (--shared.count > 0) return;
        this.docRefs.delete(blockId);
        shared.release();
      },
    };
  }

  private setSummaryJob(blockId: string, job: MeetingSummaryJob | null) {
    const jobs = { ...this.summaries$.value };
    if (job) jobs[blockId] = job;
    else delete jobs[blockId];
    this.summaries$.setValue(jobs);
  }

  /** Generates (or regenerates) the summary and, if untitled, the title. */
  async summarize(docId: string, blockId: string) {
    if (this.summaries$.value[blockId]?.status === 'running') return;
    const ref = this.retain(docId, blockId);
    this.setSummaryJob(blockId, { status: 'running' });
    try {
      const api = this.api();
      const model = ref.model();
      if (!api || !model) throw new Error('The meeting is no longer available');
      const props = model.props;
      const summary = await api.summarize({
        title: props.title,
        date: props.date ? new Date(props.date).toISOString() : undefined,
        attendees: [...props.attendees],
        notes: sectionToMarkdown(model.notesSection),
        transcript: props.transcript.map(segment => ({
          start: Math.round(segment.start / 1000),
          text: segment.text,
        })),
        instructions: props.instructions,
        customInstructions:
          props.instructions === 'custom'
            ? props.customInstructions
            : undefined,
        language: props.language,
        uiLanguage: I18n.language,
      });
      // the block may have been replaced while the AI was working
      const current = ref.model();
      if (!current) return;
      const parsed = parseSummaryMarkdown(summary.markdown);
      writeSummary(current.store, current, parsed.blocks, {
        summarizedAt: Date.now(),
        feedback: '',
        ...(current.props.title
          ? {}
          : { title: summary.title || parsed.title || '' }),
      });
      this.setSummaryJob(blockId, null);
    } catch (error) {
      logger.error('summary failed', error);
      this.setSummaryJob(blockId, {
        status: 'error',
        message: errorMessage(error),
      });
    } finally {
      ref.release();
    }
  }

  dismissSummaryError(blockId: string) {
    if (this.summaries$.value[blockId]?.status === 'error') {
      this.setSummaryJob(blockId, null);
    }
  }
}
