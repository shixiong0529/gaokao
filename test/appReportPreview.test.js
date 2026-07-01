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
