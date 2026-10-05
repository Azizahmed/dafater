/**
 * Editor bidi rules that cannot be expressed with logical properties alone.
 * Every rule is scoped to right-to-left content (`:dir(rtl)`), or only
 * isolates runs, so left-to-right documents render exactly as before.
 */
export const EDITOR_BIDI_CSS = `
/* Tracking breaks the joining of Arabic letters: headings use negative
   letter-spacing for Latin, which must not apply to RTL text. */
:is(affine-paragraph, affine-list):dir(rtl) :is(.h1, .h2, .h3, .h4, .h5, .h6) {
  letter-spacing: normal;
}

/* Arabic has no italic: fonts without an italic face (Thmanyah, most Arabic
   system fonts) would be slanted synthetically, which reads as broken. */
:is(affine-paragraph, affine-list):dir(rtl) {
  font-synthesis-style: none;
}
/* Nested left-to-right blocks keep the default. */
:is(affine-paragraph, affine-list):dir(ltr) {
  font-synthesis-style: auto;
}

/* Inline code and links keep their own direction inside a paragraph of the
   opposite direction, e.g. \`npm install -g\` or a URL inside Arabic text,
   so their punctuation is not reordered. */
:is(affine-paragraph, affine-list, affine-table) :is(code, affine-link a) {
  unicode-bidi: plaintext;
}

/* Code lines are left-to-right: each highlighted token (an Arabic string,
   a comment) is its own run, so the punctuation between tokens is not
   pulled into the Arabic text and reordered. */
affine-code affine-code-unit v-text {
  unicode-bidi: isolate;
}

/* Table cells are not blocks: each cell follows its own first strong
   character (the table itself follows the document direction). */
affine-table-cell rich-text {
  unicode-bidi: plaintext;
}
`;

const STYLE_ID = 'arabase-editor-bidi';

/** Installs the editor bidi stylesheet once per document. */
export function installEditorStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = EDITOR_BIDI_CSS;
  doc.head.append(style);
}
