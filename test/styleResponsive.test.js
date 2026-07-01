import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('result actions use mobile friendly layout', () => {
  const css = readFileSync(new URL('../web/style.css', import.meta.url), 'utf8');

  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.result-header \{[\s\S]*flex-direction: column/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.result-actions \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.result-actions button \{[\s\S]*min-height: 44px/);
});
