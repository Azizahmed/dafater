import { I18n } from '@affine/i18n';
import type { SlashMenuTranslate } from '@arabase/blocksuite';

const PREFIX = 'com.affine.editor.slash-menu.';

/**
 * English source text of BlockSuite's slash menu (item names, descriptions,
 * group labels and tooltip captions) → i18n key suffix.
 */
const SLASH_MENU_KEYS: Record<string, string> = {
  Basic: 'group.basic',
  List: 'group.list',
  'Dafater AI': 'group.ai',
  Align: 'group.align',
  Style: 'group.style',
  Page: 'group.page',
  'Content & Media': 'group.content-media',
  'Edgeless Element': 'group.edgeless-element',
  Date: 'group.date',
  Database: 'group.database',
  Actions: 'group.actions',
  Text: 'text',
  'Start typing with plain text.': 'text.description',
  'Heading 1': 'heading-1',
  'Heading #1': 'heading-1',
  'Headings in the largest font.': 'heading-1.description',
  'Heading 2': 'heading-2',
  'Heading #2': 'heading-2',
  'Headings in the 2nd font size.': 'heading-2.description',
  'Heading 3': 'heading-3',
  'Heading #3': 'heading-3',
  'Headings in the 3rd font size.': 'heading-3.description',
  'Heading 4': 'heading-4',
  'Heading #4': 'heading-4',
  'Headings in the 4th font size.': 'heading-4.description',
  'Heading 5': 'heading-5',
  'Heading #5': 'heading-5',
  'Headings in the 5th font size.': 'heading-5.description',
  'Heading 6': 'heading-6',
  'Heading #6': 'heading-6',
  'Headings in the 6th font size.': 'heading-6.description',
  'Other Headings': 'other-headings',
  'Code Block': 'code-block',
  'Code snippet with formatting.': 'code-block.description',
  Quote: 'quote',
  'Add a blockquote for emphasis.': 'quote.description',
  Divider: 'divider',
  'Visually separate content.': 'divider.description',
  'Inline equation': 'inline-equation',
  'Create a inline equation.': 'inline-equation.description',
  Callout: 'callout',
  'Let your words stand out.': 'callout.description',
  'Bulleted List': 'bulleted-list',
  'Create a bulleted list.': 'bulleted-list.description',
  'Numbered List': 'numbered-list',
  'Create a numbered list.': 'numbered-list.description',
  'To-do List': 'todo-list',
  'Add tasks to a to-do list.': 'todo-list.description',
  'Align left': 'align-left',
  'Align center': 'align-center',
  'Align right': 'align-right',
  Bold: 'bold',
  'Bold Text': 'bold-text',
  Italic: 'italic',
  Underline: 'underline',
  Strikethrough: 'strikethrough',
  'New Doc': 'new-doc',
  'Start a new document.': 'new-doc.description',
  'Linked Doc': 'linked-doc',
  'Link to another document.': 'linked-doc.description',
  'Link Doc': 'link-doc',
  Table: 'table',
  'Create a simple table.': 'table.description',
  Image: 'image',
  'Insert an image.': 'image.description',
  Photo: 'photo',
  Link: 'link',
  'Add a bookmark for reference.': 'link.description',
  Attachment: 'attachment',
  'Attach a file to document.': 'attachment.description',
  PDF: 'pdf',
  'Upload a PDF to document.': 'pdf.description',
  Embed: 'embed',
  'For Google Drive, and more.': 'embed.description',
  'Embed a YouTube video.': 'youtube.description',
  'YouTube Video': 'youtube-video',
  'Link to a GitHub repository.': 'github.description',
  'GitHub Repo': 'github-repo',
  'Embed a Figma document.': 'figma.description',
  'Embed a Loom video.': 'loom.description',
  Equation: 'equation',
  'Create a equation block.': 'equation.description',
  Frame: 'frame',
  'Insert a blank frame': 'frame.description',
  'Mind Map': 'mind-map',
  'Insert a mind map': 'mind-map.description',
  Edgeless: 'edgeless',
  Today: 'today',
  Tomorrow: 'tomorrow',
  Yesterday: 'yesterday',
  Now: 'now',
  'Add a database to this doc.': 'database-inline.description',
  'Database – Full Page': 'database-full-page',
  'In a new doc, linked here.': 'database-full-page.description',
  'Table View': 'database-table-view',
  'Display items in a table format.': 'table-view.description',
  'Calendar View': 'database-calendar-view',
  'Display items by date in a calendar.': 'calendar-view.description',
  'Board View': 'database-board-view',
  'Track items as cards grouped by status.': 'database-board-view.description',
  Todo: 'todo',
  'Move Up': 'move-up',
  'Shift this line up.': 'move-up.description',
  'Move Down': 'move-down',
  'Shift this line down.': 'move-down.description',
  Copy: 'copy',
  'Copy this line to clipboard.': 'copy.description',
  'Copy / Duplicate': 'copy-duplicate',
  Duplicate: 'duplicate',
  'Create a duplicate of this line.': 'duplicate.description',
  Delete: 'delete',
  'Remove this line permanently.': 'delete.description',
  'Ask AI': 'ai.ask',
  'Fix spelling from above': 'ai.fix-spelling',
  'Fix grammar from above': 'ai.fix-grammar',
  Summarize: 'ai.summarize',
  'Continue writing': 'ai.continue-writing',
  'Action with above': 'ai.action-with-above',
  'Translate to': 'ai.translate-to',
  'Change tone to': 'ai.change-tone-to',
  'Improve writing': 'ai.improve-writing',
  'Make it longer': 'ai.make-longer',
  'Make it shorter': 'ai.make-shorter',
  'Generate outline': 'ai.generate-outline',
  'Find actions': 'ai.find-actions',
  Arabic: 'ai.lang.arabic',
  English: 'ai.lang.english',
  'Brazilian Portuguese': 'ai.lang.brazilian-portuguese',
  Spanish: 'ai.lang.spanish',
  German: 'ai.lang.german',
  French: 'ai.lang.french',
  Italian: 'ai.lang.italian',
  'Simplified Chinese': 'ai.lang.simplified-chinese',
  'Traditional Chinese': 'ai.lang.traditional-chinese',
  Japanese: 'ai.lang.japanese',
  Russian: 'ai.lang.russian',
  Korean: 'ai.lang.korean',
  Professional: 'ai.tone.professional',
  Informal: 'ai.tone.informal',
  Friendly: 'ai.tone.friendly',
  Critical: 'ai.tone.critical',
  Humorous: 'ai.tone.humorous',
};

/**
 * Item names (and tooltip captions) whose English text is also a group
 * label: the "Database" item is «قاعدة بيانات», its group «قاعدة البيانات».
 */
const ITEM_KEYS: Record<string, string> = {
  Database: 'database-inline',
};

/** Item names built from user content, e.g. "Frame: Roadmap". */
const TITLED_ITEMS: [prefix: string, key: string][] = [
  ['Frame: ', 'frame-with-title'],
  ['Group: ', 'group-with-title'],
];

function localize(key: string, options?: Record<string, string>) {
  const fullKey = PREFIX + key;
  const text = I18n.t(fullKey, options);
  // Unknown key, or the language has no translation: keep BlockSuite's text.
  if (text === fullKey || text === I18n.t(fullKey, { ...options, lng: 'en' }))
    return undefined;
  return text;
}

/** Localises the slash menu through the app's i18n (resolved at render). */
export const dafaterSlashMenuTranslate: SlashMenuTranslate = (
  english,
  field
) => {
  if (
    (field === 'name' || field === 'caption') &&
    Object.hasOwn(ITEM_KEYS, english)
  ) {
    return localize(ITEM_KEYS[english]);
  }
  if (Object.hasOwn(SLASH_MENU_KEYS, english)) {
    return localize(SLASH_MENU_KEYS[english]);
  }
  if (field !== 'name') return undefined;
  for (const [prefix, titledKey] of TITLED_ITEMS) {
    if (english.startsWith(prefix)) {
      return localize(titledKey, { title: english.slice(prefix.length) });
    }
  }
  return undefined;
};
