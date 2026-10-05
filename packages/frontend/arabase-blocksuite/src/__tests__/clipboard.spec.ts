/**
 * @vitest-environment happy-dom
 */
import { describe, expect, test } from 'vitest';

import { addHtmlTextDirections } from '../clipboard';

const dirs = (html: string) => {
  const root = document.createElement('div');
  root.innerHTML = html;
  return [...root.querySelectorAll('[dir]')].map(
    element => `${element.tagName.toLowerCase()}:${element.getAttribute('dir')}`
  );
};

describe('addHtmlTextDirections', () => {
  test('marks each paragraph with the direction of its content', () => {
    const html = addHtmlTextDirections(
      '<h1>عنوان</h1><p>API endpoint يرجع JSON</p><p>Plain English</p><p>2026</p>'
    );
    expect(dirs(html)).toEqual(['h1:rtl', 'p:rtl', 'p:ltr']);
  });

  test('list items use their own text, not their nested lists', () => {
    const html = addHtmlTextDirections(
      '<ul><li>English item<ul><li>عنصر فرعي</li></ul></li></ul>'
    );
    expect(dirs(html)).toEqual(['li:ltr', 'li:rtl']);
  });

  test('code stays left-to-right and tables follow their cells', () => {
    const html = addHtmlTextDirections(
      '<pre><code>// تعليق\nconst x = 1;</code></pre>' +
        '<table><tr><td>الاسم</td><td>Name</td></tr></table>'
    );
    expect(dirs(html)).toEqual(['pre:ltr', 'table:rtl', 'td:rtl', 'td:ltr']);
  });

  test('explicit directions win over the content', () => {
    const html = addHtmlTextDirections('<p>فقرة عربية</p>', {
      explicit: new Map([['فقرة عربية', 'ltr']]),
    });
    expect(dirs(html)).toEqual(['p:ltr']);
  });

  test('the first-strong strategy follows the first strong letter', () => {
    const html = addHtmlTextDirections('<p>API يرجع</p>', {
      strategy: 'first-strong',
    });
    expect(dirs(html)).toEqual(['p:ltr']);
  });

  test('existing dir attributes and neutral text are kept as is', () => {
    const source = '<p dir="ltr">مرحبا</p><p>123</p>';
    expect(addHtmlTextDirections(source)).toBe(source);
  });
});
