import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('report preview uses blob iframe source for mobile webview compatibility', () => {
  const js = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

  assert.match(js, /let currentReportUrl = null/);
  assert.match(js, /function renderReportPreview\(html\)/);
  assert.match(js, /new Blob\(\[html\], \{ type: 'text\/html;charset=utf-8' \}\)/);
  assert.match(js, /URL\.createObjectURL\(blob\)/);
  assert.match(js, /reportFrame\.src = currentReportUrl/);
  assert.match(js, /function resetReportPreview\(\)/);
  assert.match(js, /URL\.revokeObjectURL\(currentReportUrl\)/);
});
