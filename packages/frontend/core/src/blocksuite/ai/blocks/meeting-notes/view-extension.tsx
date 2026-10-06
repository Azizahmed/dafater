import type { ReactToLit } from '@affine/component';
import { ServerService } from '@affine/core/modules/cloud';
import { focusTextModel } from '@blocksuite/affine/rich-text';
import { registerContentBoundary } from '@blocksuite/affine/shared/utils';
import type { ExtensionType } from '@blocksuite/affine/store';
import {
  type SlashMenuConfig,
  SlashMenuConfigExtension,
} from '@blocksuite/affine/widgets/slash-menu';
import { TranscriptWithAiIcon } from '@blocksuite/icons/lit';
import type { FrameworkProvider } from '@toeverything/infra';

import { insertMeetingNotesBlock } from './content';
import {
  MeetingNotesBlockSpec,
  type MeetingNotesRenderer,
  MeetingNotesRendererIdentifier,
} from './meeting-notes-block';
import { MeetingNotesSectionFlavour } from './model';
import {
  MeetingNotesFooter,
  MeetingNotesSummaryStatus,
  MeetingNotesTop,
  MeetingNotesTranscript,
} from './view/meeting-notes-view';

// Backspace / Delete never merge notes with the summary or the page around
registerContentBoundary(MeetingNotesSectionFlavour);

function meetingNotesSlashMenu(framework: FrameworkProvider): SlashMenuConfig {
  return {
    items: [
      {
        name: 'AI Meeting Notes',
        description: 'Transcribe and summarize a meeting with AI.',
        icon: TranscriptWithAiIcon(),
        searchAlias: [
          'meeting',
          'meeting notes',
          'transcribe',
          'transcript',
          'record',
          'minutes',
          'اجتماع',
          'محضر',
          'تفريغ',
          'تسجيل',
          'ملاحظات',
        ],
        group: '1_Dafater AI@-1',
        when: ({ model }) => {
          // only at the top level of a note (no nesting in lists, callouts
          // or another meeting)
          if (model.store.getParent(model)?.flavour !== 'affine:note') {
            return false;
          }
          const server = framework.getOptional(ServerService)?.server;
          return server?.features$.value.copilot !== false;
        },
        action: ({ std, model }) => {
          const store = model.store;
          const parent = store.getParent(model);
          if (!parent) return;
          const index = parent.children.indexOf(model);
          const replace = (model.text?.length ?? 0) === 0;
          const { paragraphId } = insertMeetingNotesBlock(
            store,
            parent,
            index + 1
          );
          if (replace) store.deleteBlock(model);
          std.host.updateComplete
            .then(() => focusTextModel(std, paragraphId))
            .catch(console.error);
        },
      },
    ],
  };
}

export function meetingNotesViewExtensions(
  framework: FrameworkProvider,
  reactToLit: ReactToLit
): ExtensionType[] {
  const renderer: MeetingNotesRenderer = {
    top: handle => reactToLit(<MeetingNotesTop handle={handle} />),
    summaryStatus: handle =>
      reactToLit(<MeetingNotesSummaryStatus handle={handle} />),
    transcript: handle =>
      reactToLit(<MeetingNotesTranscript handle={handle} />),
    footer: handle => reactToLit(<MeetingNotesFooter handle={handle} />),
  };
  return [
    ...MeetingNotesBlockSpec,
    {
      setup: di => {
        di.addImpl(MeetingNotesRendererIdentifier, () => renderer);
      },
    },
    SlashMenuConfigExtension(
      'dafater:meeting-notes',
      meetingNotesSlashMenu(framework)
    ),
  ];
}
