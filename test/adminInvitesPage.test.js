import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('admin invite form keeps a stable form reference across async callbacks', () => {
  const html = readFileSync(new URL('../web/admin-invites.html', import.meta.url), 'utf8');

  assert.match(html, /var form = e\.currentTarget;/);
  assert.doesNotMatch(html, /\.then\([\s\S]*?e\.currentTarget\.reset\(\)/);
});
