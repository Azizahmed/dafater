import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/affine/store';

/**
 * Dafater: AI meeting notes (Notion-style). One block holds the meeting's
 * title, date, attendees and transcript; its two sections hold real blocks:
 * the user's notes and the AI summary.
 *
 * ```
 * affine:meeting-notes
 *   affine:meeting-notes-section (kind: notes)    → paragraphs, lists…
 *   affine:meeting-notes-section (kind: summary)  → created by the AI
 * ```
 */
export const MeetingNotesBlockFlavour = 'affine:meeting-notes';
export const MeetingNotesSectionFlavour = 'affine:meeting-notes-section';

export type MeetingTranscriptSegment = {
  id: string;
  /** From the start of the recording, in ms. */
  start: number;
  end: number;
  text: string;
};

export const MEETING_INSTRUCTIONS = [
  'auto',
  'brief',
  'detailed',
  'action-items',
  'lecture',
  'interview',
  'standup',
  'custom',
] as const;

export type MeetingNotesInstructions = (typeof MEETING_INSTRUCTIONS)[number];

export type MeetingNotesFeedback = '' | 'up' | 'down';

export type MeetingNotesBlockProps = {
  /** Empty: the default title ("Meeting"), replaced by the AI title. */
  title: string;
  /** Meeting date, ms since epoch. */
  date: number;
  attendees: string[];
  instructions: MeetingNotesInstructions;
  customInstructions: string;
  /** Spoken language: `auto` or an ISO 639-1 code. */
  language: string;
  transcript: MeetingTranscriptSegment[];
  /** Total recorded time, ms; new recordings continue from here. */
  durationMs: number;
  /** When the current summary was generated, ms since epoch (0: none). */
  summarizedAt: number;
  feedback: MeetingNotesFeedback;
};

export const MeetingNotesBlockSchema = defineBlockSchema({
  flavour: MeetingNotesBlockFlavour,
  props: (): MeetingNotesBlockProps => ({
    title: '',
    date: 0,
    attendees: [],
    instructions: 'auto',
    customInstructions: '',
    language: 'auto',
    transcript: [],
    durationMs: 0,
    summarizedAt: 0,
    feedback: '',
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: ['affine:note'],
    children: [MeetingNotesSectionFlavour],
  },
  toModel: () => new MeetingNotesBlockModel(),
});

export class MeetingNotesBlockModel extends BlockModel<MeetingNotesBlockProps> {
  get notesSection() {
    return findSection(this, 'notes');
  }

  get summarySection() {
    return findSection(this, 'summary');
  }
}

export type MeetingNotesSectionKind = 'notes' | 'summary';

export type MeetingNotesSectionProps = {
  kind: MeetingNotesSectionKind;
};

export const MeetingNotesSectionSchema = defineBlockSchema({
  flavour: MeetingNotesSectionFlavour,
  props: (): MeetingNotesSectionProps => ({ kind: 'notes' }),
  metadata: {
    version: 1,
    role: 'hub',
    parent: [MeetingNotesBlockFlavour],
    // callouts are hubs, like in a note
    children: ['@content', 'affine:callout'],
  },
  toModel: () => new MeetingNotesSectionModel(),
});

export class MeetingNotesSectionModel extends BlockModel<MeetingNotesSectionProps> {}

function findSection(
  model: MeetingNotesBlockModel,
  kind: MeetingNotesSectionKind
) {
  return (
    (model.children.find(
      child =>
        child.flavour === MeetingNotesSectionFlavour &&
        (child as MeetingNotesSectionModel).props.kind === kind
    ) as MeetingNotesSectionModel | undefined) ?? null
  );
}

export const MeetingNotesBlockSchemaExtension = BlockSchemaExtension(
  MeetingNotesBlockSchema
);

export const MeetingNotesSectionSchemaExtension = BlockSchemaExtension(
  MeetingNotesSectionSchema
);
