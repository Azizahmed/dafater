import type { BlockStdScope } from '@blocksuite/affine/std';
import type { Signal } from '@preact/signals-core';

import type { MeetingNotesBlockModel } from './model';

export type MeetingNotesTab = 'summary' | 'notes' | 'transcript';

/** What the block component shares with its React parts. */
export interface MeetingNotesBlockHandle {
  readonly model: MeetingNotesBlockModel;
  readonly std: BlockStdScope;
  readonly tab$: Signal<MeetingNotesTab>;
  readonly shareBarDismissed$: Signal<boolean>;
  focusNotes(): void;
}
