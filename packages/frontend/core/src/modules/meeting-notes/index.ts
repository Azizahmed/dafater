import type { Framework } from '@toeverything/infra';

import { DefaultServerService, WorkspaceServerService } from '../cloud';
import { DocsService } from '../doc';
import { WorkspaceScope } from '../workspace';
import { MeetingNotesService } from './services/meeting-notes';

export { MeetingNotesApi } from './api';
export type { MeetingSession } from './entities/meeting-session';
export type { RecordingSource } from './recorder/recorder';
export { canCaptureTabAudio, canRecordAudio } from './recorder/recorder';
export { MeetingNotesService } from './services/meeting-notes';

export function configureMeetingNotesModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(MeetingNotesService, [
      WorkspaceServerService,
      DefaultServerService,
      DocsService,
    ]);
}
