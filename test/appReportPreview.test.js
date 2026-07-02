import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('report preview provides direct mobile fallback instead of relying on iframe', () => {
  const js = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../web/style.css', import.meta.url), 'utf8');

  assert.match(html, /<div id="reportPreview" class="report-preview"><\/div>/);
  assert.match(js, /const reportPreview = document\.getElementById\('reportPreview'\)/);
  assert.match(js, /function buildInlinePreviewHtml\(html\)/);
  assert.match(js, /reportPreview\.innerHTML = buildInlinePreviewHtml\(html\)/);
  assert.match(js, /reportPreview\.innerHTML = ''/);
  assert.match(js, /let currentReportUrl = null/);
  assert.match(js, /URL\.revokeObjectURL\(currentReportUrl\)/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.report-frame \{[\s\S]*display: none/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.report-preview \{[\s\S]*display: block/);
});

test('open report opens the generated html page url in a new window', () => {
  const js = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

  assert.match(js, /window\.openReport = function\(\)/);
  assert.match(js, /if \(currentReportUrl\) \{[\s\S]*window\.open\(currentReportUrl, '_blank'\)/);
  assert.match(js, /w\.document\.write\(currentHtml\)/);
});

test('successful report generation scrolls to the result section', () => {
  const js = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

  assert.match(js, /function scrollToReportResult\(\)/);
  assert.match(js, /resultEl\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.match(js, /renderReportPreview\(data\.html\);\s*hideLoading\(\);\s*scrollToReportResult\(\);/);
});

test('result section breaks out of the narrow form container to use full viewport width', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

  // #result must escape .mj-resultsec's max-width:920px via a full-bleed rule
  assert.match(html, /#result\s*\{[\s\S]*width:\s*100vw[\s\S]*\}/);
  assert.match(html, /margin-left:\s*calc\(50% - 50vw\)/);
});

test('report frame height auto-fits its content instead of a fixed small scroll box', () => {
  const js = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

  assert.match(js, /function fitReportFrameToContent\(\)/);
  assert.match(js, /reportFrame\.addEventListener\('load', fitReportFrameToContent/);
  assert.match(js, /reportFrame\.style\.height = h \+ 'px'/);
  assert.match(js, /ResizeObserver/);
});

test('report restore runs at end of file after all declarations (TDZ regression)', () => {
  const js = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

  // restoreReportFromSession() 曾在文件中段调用，踩中后面 let 声明的暂时性死区，
  // 静默失败留下空白 iframe。调用必须晚于全部函数/let 声明（放在 openReport 之后）
  const invocation = js.lastIndexOf('restoreReportFromSession();');
  const openReport = js.indexOf('window.openReport = function');
  const observerDecl = js.indexOf('let reportFrameResizeObserver');
  const firstObserverUse = js.indexOf('reportFrameResizeObserver.disconnect');
  assert.ok(invocation > openReport, 'restore 调用必须在文件末尾');
  assert.ok(observerDecl > -1 && observerDecl < firstObserverUse, 'let 声明必须先于使用');
  // 恢复失败不允许静默：必须有日志且把空白结果区收起来
  assert.match(js, /console\.warn\('\[report-restore\]/);
});

test('report internal container width is not capped as narrowly as the old 900px box', () => {
  const reportJs = readFileSync(new URL('../api/tools/report.js', import.meta.url), 'utf8');

  assert.match(reportJs, /\.container \{ max-width: 1[0-9]{3}px; margin: 0 auto; \}/);
  assert.doesNotMatch(reportJs, /\.container \{ max-width: 900px/);
});
