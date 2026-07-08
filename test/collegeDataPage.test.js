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

test('admission score page exists with province selector and admission API loading', () => {
  const html = readFileSync(new URL('../web/admission-score.html', import.meta.url), 'utf8');

  assert.match(html, /院校录取分/);
  assert.match(html, /id="provinceSelect"/);
  assert.match(html, /var FIELDS = \['科类', '院校代号', '院校名称', '专业组编号', '专业组名称', '投档线', '备注'\]/);
  assert.match(html, /fetch\('\/api\/admission\/' \+ province\.slug\)/);
  assert.match(html, /normalizeCollegeName\(row\['院校名称'\]\) === normalizedCollege/);
});

test('public navigation links to college data page', () => {
  for (const file of ['index.html', 'reference.html', 'methodology.html', 'about.html', 'admission-score.html']) {
    const html = readFileSync(new URL(`../web/${file}`, import.meta.url), 'utf8');
    assert.match(html, /href="college-data\.html"[^>]*>院校数据/);
  }
});

test('each college row links to the admission score page instead of returning to the home form', () => {
  const html = readFileSync(pageUrl, 'utf8');

  assert.match(html, /admission-score\.html\?college=' \+ encodeURIComponent\(s\.name\)/);
  assert.match(html, /查看录取分/);
  assert.doesNotMatch(html, /index\.html\?college=' \+ encodeURIComponent\(s\.name\) \+ '#planForm/);
});

test('index page reads ?college= to pre-fill the preferences field and expand the final stage panel', () => {
  const js = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

  assert.match(js, /function applyCollegeQueryParam\(\)/);
  assert.match(js, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(js, /params\.get\('college'\)/);
  assert.match(js, /document\.getElementById\('finalReportPanel'\)/);
  assert.match(js, /applyCollegeQueryParam\(\);\s*$/);
});

test('server exposes a read-only admission data endpoint for page loading', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(server, /const ADMISSION_FILES = \{/);
  assert.match(server, /hunan: 'hunan-2025-benke\.json'/);
  assert.match(server, /app\.get\('\/api\/admission\/:province'/);
  assert.match(server, /res\.sendFile\(path\.join\(__dirname, 'data\/admission', fileName\)\)/);
});
