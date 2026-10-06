import { describe, expect, test } from 'vitest';

import { parseInline, parseSummaryMarkdown } from '../summary-markdown';

describe('parseSummaryMarkdown', () => {
  test('takes the first level-1 heading as the title', () => {
    const { title, blocks } = parseSummaryMarkdown(
      [
        '# تبادل تحية قصير',
        '',
        '## نظرة عامة',
        '- اقتصر الاجتماع على تحية قصيرة',
        '- لم تُناقش أي موضوعات',
        '',
        '## المهام',
        '- [ ] إرسال المحضر — سارة',
        '- [x] حجز القاعة',
      ].join('\n')
    );
    expect(title).toBe('تبادل تحية قصير');
    expect(blocks.map(block => block.flavour)).toEqual([
      'affine:paragraph',
      'affine:list',
      'affine:list',
      'affine:paragraph',
      'affine:list',
      'affine:list',
    ]);
    expect(blocks[0]).toMatchObject({
      type: 'h4',
      delta: [{ insert: 'نظرة عامة' }],
    });
    expect(blocks[1]).toMatchObject({ type: 'bulleted', checked: false });
    expect(blocks[4]).toMatchObject({
      type: 'todo',
      checked: false,
      delta: [{ insert: 'إرسال المحضر — سارة' }],
    });
    expect(blocks[5]).toMatchObject({ type: 'todo', checked: true });
  });

  test('a heading after content is not the title', () => {
    const { title, blocks } = parseSummaryMarkdown('Intro\n# Later');
    expect(title).toBeNull();
    expect(blocks[1]).toMatchObject({ type: 'h3' });
  });

  test('ignores code fences around the answer and blank lines', () => {
    const { title, blocks } = parseSummaryMarkdown(
      '```markdown\n# Weekly sync\n\n## Overview\n- Shipped v2\n```'
    );
    expect(title).toBe('Weekly sync');
    expect(blocks).toHaveLength(2);
  });

  test('nests indented list items and numbers ordered ones', () => {
    const { blocks } = parseSummaryMarkdown(
      ['1. First', '   - detail', '     - deeper', '2. Second', '- back'].join(
        '\n'
      )
    );
    expect(blocks).toHaveLength(3);
    const [first, second, back] = blocks;
    expect(first).toMatchObject({ type: 'numbered' });
    expect(first.children).toHaveLength(1);
    expect(first.children[0]).toMatchObject({ type: 'bulleted' });
    expect(first.children[0].children[0]).toMatchObject({
      delta: [{ insert: 'deeper' }],
    });
    expect(second).toMatchObject({ type: 'numbered' });
    expect(back).toMatchObject({ type: 'bulleted' });
  });

  test('paragraphs, quotes and dividers', () => {
    const { blocks } = parseSummaryMarkdown('Text\n> quoted\n---\nafter');
    expect(blocks.map(block => block.flavour)).toEqual([
      'affine:paragraph',
      'affine:paragraph',
      'affine:divider',
      'affine:paragraph',
    ]);
    expect(blocks[1]).toMatchObject({
      type: 'quote',
      delta: [{ insert: 'quoted' }],
    });
  });

  test('strips Markdown from the title', () => {
    expect(parseSummaryMarkdown('# **Q3** planning').title).toBe('Q3 planning');
  });
});

describe('parseInline', () => {
  test('bold, italic, code, strike and links', () => {
    expect(
      parseInline('a **b** *c* `d` ~~e~~ [f](https://example.com)')
    ).toEqual([
      { insert: 'a ' },
      { insert: 'b', attributes: { bold: true } },
      { insert: ' ' },
      { insert: 'c', attributes: { italic: true } },
      { insert: ' ' },
      { insert: 'd', attributes: { code: true } },
      { insert: ' ' },
      { insert: 'e', attributes: { strike: true } },
      { insert: ' ' },
      { insert: 'f', attributes: { link: 'https://example.com' } },
    ]);
  });

  test('nested formatting inside bold', () => {
    expect(parseInline('**owner *Sara* today**')).toEqual([
      { insert: 'owner ', attributes: { bold: true } },
      { insert: 'Sara', attributes: { bold: true, italic: true } },
      { insert: ' today', attributes: { bold: true } },
    ]);
  });

  test('plain Arabic text and lone asterisks stay as they are', () => {
    expect(parseInline('٣ * ٤ = ١٢')).toEqual([{ insert: '٣ * ٤ = ١٢' }]);
    expect(parseInline('')).toEqual([]);
  });

  test('ignores links that are not http(s)', () => {
    expect(parseInline('[x](javascript:alert(1))')).toEqual([
      { insert: '[x](javascript:alert(1))' },
    ]);
  });
});
