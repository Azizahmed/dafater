import type { AffineTextAttributes } from '@blocksuite/affine/shared/types';
import type { DeltaInsert } from '@blocksuite/affine/store';

/**
 * The AI summary arrives as a small Markdown subset (headings, bullets, task
 * lists, numbered lists, paragraphs, bold/italic/code/strike/links). It is
 * converted here, synchronously, into block specs that are written straight
 * into the summary section — no async adapters, so the write can stay out of
 * the user's undo history.
 */

export type SummaryDelta = DeltaInsert<AffineTextAttributes>;

export type SummaryParagraphType =
  | 'text'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'quote';

export type SummaryBlockSpec =
  | {
      flavour: 'affine:paragraph';
      type: SummaryParagraphType;
      delta: SummaryDelta[];
      children: SummaryBlockSpec[];
    }
  | {
      flavour: 'affine:list';
      type: 'bulleted' | 'numbered' | 'todo';
      checked: boolean;
      delta: SummaryDelta[];
      children: SummaryBlockSpec[];
    }
  | { flavour: 'affine:divider'; children: SummaryBlockSpec[] };

export type ParsedSummary = {
  title: string | null;
  blocks: SummaryBlockSpec[];
};

const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^(\s*)(?:[-*+]|(\d+)[.)])\s+(.*)$/;
const TASK = /^\[( |x|X)\]\s+(.*)$/;
const DIVIDER = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*```/;

// a summary sits inside a card: `##` sections render as h4
const HEADING_TYPES: SummaryParagraphType[] = ['h3', 'h4', 'h5', 'h6'];

export function parseSummaryMarkdown(markdown: string): ParsedSummary {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: SummaryBlockSpec[] = [];
  let title: string | null = null;
  // list nesting: indentation (in columns) of each open list item
  const stack: { indent: number; spec: SummaryBlockSpec }[] = [];

  for (const raw of lines) {
    // models sometimes wrap the answer in a code fence
    if (FENCE.test(raw)) continue;
    const line = raw.replace(/\t/g, '  ').replace(/\s+$/, '');
    if (!line.trim()) continue;

    const heading = !LIST_ITEM.test(line) && HEADING.exec(line.trim());
    if (heading) {
      stack.length = 0;
      const level = heading[1].length;
      const text = heading[2].replace(/\s+#+\s*$/, '').trim();
      if (level === 1 && title === null && blocks.length === 0) {
        title = stripInlineMarkdown(text);
        continue;
      }
      blocks.push({
        flavour: 'affine:paragraph',
        type: HEADING_TYPES[level - 1] ?? 'h6',
        delta: parseInline(text),
        children: [],
      });
      continue;
    }

    if (DIVIDER.test(line)) {
      stack.length = 0;
      blocks.push({ flavour: 'affine:divider', children: [] });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      const indent = item[1].length;
      let content = item[3];
      let type: 'bulleted' | 'numbered' | 'todo' = item[2]
        ? 'numbered'
        : 'bulleted';
      let checked = false;
      const task = TASK.exec(content);
      if (task) {
        type = 'todo';
        checked = task[1].toLowerCase() === 'x';
        content = task[2];
      }
      const spec: SummaryBlockSpec = {
        flavour: 'affine:list',
        type,
        checked,
        delta: parseInline(content.trim()),
        children: [],
      };
      while (stack.length && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      const parent = stack[stack.length - 1];
      (parent ? parent.spec.children : blocks).push(spec);
      stack.push({ indent, spec });
      continue;
    }

    stack.length = 0;
    const quote = /^>\s?(.*)$/.exec(line.trim());
    blocks.push({
      flavour: 'affine:paragraph',
      type: quote ? 'quote' : 'text',
      delta: parseInline((quote ? quote[1] : line).trim()),
      children: [],
    });
  }

  return { title, blocks };
}

type InlineRule = {
  pattern: RegExp;
  attributes: (match: RegExpExecArray) => AffineTextAttributes;
  /** group with the inner text; inner Markdown is parsed recursively */
  group: number;
  nested: boolean;
};

const INLINE_RULES: InlineRule[] = [
  {
    pattern: /`([^`\n]+)`/,
    attributes: () => ({ code: true }),
    group: 1,
    nested: false,
  },
  {
    pattern: /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/,
    attributes: match => ({ link: match[2] }),
    group: 1,
    nested: true,
  },
  {
    pattern: /\*\*(?!\s)(.+?)(?<!\s)\*\*|__(?!\s)(.+?)(?<!\s)__/,
    attributes: () => ({ bold: true }),
    group: 1,
    nested: true,
  },
  {
    pattern: /~~(?!\s)(.+?)(?<!\s)~~/,
    attributes: () => ({ strike: true }),
    group: 1,
    nested: true,
  },
  {
    pattern: /(?<![*\w])\*(?![\s*])(.+?)(?<![\s*])\*(?![*\w])/,
    attributes: () => ({ italic: true }),
    group: 1,
    nested: true,
  },
];

export function parseInline(
  text: string,
  inherited: AffineTextAttributes = {}
): SummaryDelta[] {
  let earliest: { rule: InlineRule; match: RegExpExecArray } | null = null;
  for (const rule of INLINE_RULES) {
    const match = rule.pattern.exec(text);
    if (match && (!earliest || match.index < earliest.match.index)) {
      earliest = { rule, match };
    }
  }
  const plain = (insert: string): SummaryDelta[] =>
    insert
      ? [
          Object.keys(inherited).length
            ? { insert, attributes: { ...inherited } }
            : { insert },
        ]
      : [];
  if (!earliest) return plain(text);

  const { rule, match } = earliest;
  const inner = match[rule.group] ?? match[rule.group + 1] ?? '';
  const attributes = { ...inherited, ...rule.attributes(match) };
  return mergeDeltas([
    ...plain(text.slice(0, match.index)),
    ...(rule.nested
      ? parseInline(inner, attributes)
      : [{ insert: inner, attributes }]),
    ...parseInline(text.slice(match.index + match[0].length), inherited),
  ]);
}

function sameAttributes(
  left: AffineTextAttributes | undefined,
  right: AffineTextAttributes | undefined
) {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
}

function mergeDeltas(deltas: SummaryDelta[]) {
  const merged: SummaryDelta[] = [];
  for (const delta of deltas) {
    const last = merged[merged.length - 1];
    if (last && sameAttributes(last.attributes, delta.attributes)) {
      last.insert += delta.insert;
    } else {
      merged.push({ ...delta });
    }
  }
  return merged;
}

export function stripInlineMarkdown(text: string) {
  return parseInline(text)
    .map(delta => delta.insert)
    .join('')
    .trim();
}
