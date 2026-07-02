import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const pageUrl = new URL('../web/college-data.html', import.meta.url);

test('college data page exists with filters and data table', () => {
  assert.equal(existsSync(pageUrl), true);

  const html = readFileSync(pageUrl, 'utf8');
  assert.match(html, /院校数据/);
  assert.match(html, /id="provinceFilter"/);
  assert.match(html, /id="collegeRows"/);
  assert.match(html, /fetch\('colleges\.json'\)/);
});

test('public navigation links to college data page', () => {
  for (const file of ['index.html', 'reference.html', 'methodology.html', 'about.html']) {
    const html = readFileSync(new URL(`../web/${file}`, import.meta.url), 'utf8');
    assert.match(html, /href="college-data\.html"[^>]*>院校数据/);
  }
});
