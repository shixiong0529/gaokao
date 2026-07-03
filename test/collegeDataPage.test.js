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

test('each college row links to the plan form pre-filled with its name instead of showing an unreliable static score', () => {
  const html = readFileSync(pageUrl, 'utf8');

  // 本地没有覆盖全国 31 省 × 专业组的可靠录取分数据，不能在表格里编个数字；
  // 改为跳转到志愿参考表单，由 AI 按用户真实省份/选科实时查询
  assert.match(html, /index\.html\?college=' \+ encodeURIComponent\(s\.name\) \+ '#planForm/);
  assert.match(html, /查看录取分/);
});

test('index page reads ?college= to pre-fill the preferences field and expand the final stage panel', () => {
  const js = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

  assert.match(js, /function applyCollegeQueryParam\(\)/);
  assert.match(js, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(js, /params\.get\('college'\)/);
  assert.match(js, /document\.getElementById\('finalReportPanel'\)/);
  assert.match(js, /applyCollegeQueryParam\(\);\s*$/);
});
