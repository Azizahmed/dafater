import type { BlockModel, Store } from '@blocksuite/affine/store';
import { Text } from '@blocksuite/affine/store';

import {
  MeetingNotesBlockFlavour,
  type MeetingNotesBlockModel,
  type MeetingNotesBlockProps,
  MeetingNotesSectionFlavour,
  type MeetingNotesSectionKind,
  type MeetingNotesSectionModel,
} from './model';
import type { SummaryBlockSpec } from './summary-markdown';

type TextProps = {
  type?: string;
  checked?: boolean;
  language?: string;
  text?: { toString(): string };
};

const PARAGRAPH_PREFIX: Record<string, string> = {
  h1: '# ',
  h2: '## ',
  h3: '### ',
  h4: '#### ',
  h5: '##### ',
  h6: '###### ',
  quote: '> ',
};

function blockToMarkdown(block: BlockModel, depth: number, out: string[]) {
  const props = block.props as TextProps;
  const text = props.text?.toString().replace(/\s+$/, '') ?? '';
  const indent = '  '.repeat(depth);
  let childDepth = depth;

  switch (block.flavour) {
    case 'affine:paragraph': {
      if (text)
        out.push(indent + (PARAGRAPH_PREFIX[props.type ?? ''] ?? '') + text);
      break;
    }
    case 'affine:list': {
      const marker =
        props.type === 'numbered'
          ? '1. '
          : props.type === 'todo'
            ? props.checked
              ? '- [x] '
              : '- [ ] '
            : '- ';
      if (text) out.push(indent + marker + text);
      childDepth = depth + 1;
      break;
    }
    case 'affine:code': {
      if (text) out.push('```' + (props.language ?? ''), text, '```');
      break;
    }
    case 'affine:divider': {
      out.push('---');
      break;
    }
    default: {
      if (text) out.push(indent + text);
    }
  }

  for (const child of block.children) {
    blockToMarkdown(child, childDepth, out);
  }
}

/** The user's notes as Markdown, sent to the AI with the transcript. */
export function sectionToMarkdown(section: BlockModel | null) {
  if (!section) return '';
  const out: string[] = [];
  for (const child of section.children) blockToMarkdown(child, 0, out);
  return out.join('\n').trim();
}

export function isSectionEmpty(section: BlockModel | null) {
  return !sectionToMarkdown(section);
}

function addSpec(store: Store, spec: SummaryBlockSpec, parentId: string) {
  const props =
    spec.flavour === 'affine:paragraph'
      ? { type: spec.type, text: new Text(spec.delta) }
      : spec.flavour === 'affine:list'
        ? { type: spec.type, checked: spec.checked, text: new Text(spec.delta) }
        : {};
  const id = store.addBlock(spec.flavour, props, parentId);
  for (const child of spec.children) addSpec(store, child, id);
}

export function ensureSection(
  store: Store,
  model: MeetingNotesBlockModel,
  kind: MeetingNotesSectionKind
): MeetingNotesSectionModel {
  const existing = kind === 'notes' ? model.notesSection : model.summarySection;
  if (existing) return existing;
  // notes first, summary second
  const index = kind === 'notes' ? 0 : model.children.length;
  const id = store.addBlock(MeetingNotesSectionFlavour, { kind }, model, index);
  return store.getModelById(id) as MeetingNotesSectionModel;
}

/**
 * Replaces the summary section's content. Runs outside the undo history:
 * it is written by the AI, possibly while the doc is not open.
 */
export function writeSummary(
  store: Store,
  model: MeetingNotesBlockModel,
  specs: SummaryBlockSpec[],
  props: Partial<MeetingNotesBlockProps>
) {
  // one transaction per block: a new block's model only exists once its
  // transaction is committed
  store.withoutTransact(() => {
    const section = ensureSection(store, model, 'summary');
    for (const child of section.children.slice()) store.deleteBlock(child);
    for (const spec of specs) addSpec(store, spec, section.id);
    store.updateBlock(model, props);
  });
}

/** A new meeting block with an empty notes section, ready to type into. */
export function insertMeetingNotesBlock(
  store: Store,
  parent: BlockModel | string,
  index?: number,
  props: Partial<MeetingNotesBlockProps> = {}
) {
  const blockId = store.addBlock(
    MeetingNotesBlockFlavour,
    { date: Date.now(), ...props },
    parent,
    index
  );
  const sectionId = store.addBlock(
    MeetingNotesSectionFlavour,
    { kind: 'notes' },
    blockId
  );
  const paragraphId = store.addBlock('affine:paragraph', {}, sectionId);
  return { blockId, sectionId, paragraphId };
}
